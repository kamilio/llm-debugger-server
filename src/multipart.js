import Busboy from 'busboy';

export function parseMultipart(req) {
    return new Promise((resolve, reject) => {
        try {
            const busboy = Busboy({ headers: req.headers });
            const fields = {};
            const files = [];

            busboy.on('field', (name, value) => {
                fields[name] = value;
            });

            busboy.on('file', (name, stream, info) => {
                const chunks = [];
                stream.on('data', (chunk) => chunks.push(chunk));
                stream.on('limit', () => {
                    stream.resume();
                });
                stream.on('end', () => {
                    files.push({
                        fieldname: name,
                        filename: info.filename,
                        mimeType: info.mimeType,
                        encoding: info.encoding,
                        buffer: Buffer.concat(chunks),
                    });
                });
            });

            busboy.on('finish', () => resolve({ fields, files }));
            busboy.on('error', reject);

            req.pipe(busboy);
        } catch (error) {
            reject(error);
        }
    });
}
