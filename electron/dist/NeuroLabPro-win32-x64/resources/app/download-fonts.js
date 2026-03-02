const https = require('https');
const fs = require('fs');
const path = require('path');

const fontsDir = path.join(__dirname, '..', 'Visualizer', 'assets', 'fonts');
fs.mkdirSync(fontsDir, { recursive: true });

const fonts = [
    { url: 'https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPVmUsaaDhw.woff2', file: 'JetBrainsMono-300.woff2' },
    { url: 'https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjOVmUsaaDhw.woff2', file: 'JetBrainsMono-400.woff2' },
    { url: 'https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPlmUsaaDhw.woff2', file: 'JetBrainsMono-500.woff2' },
    { url: 'https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjMFiUsaaDhw.woff2', file: 'JetBrainsMono-700.woff2' },
    { url: 'https://fonts.gstatic.com/s/syne/v22/8vIS7w4qzmVxsWxjBZRjr0FKM_04uQ.woff2', file: 'Syne-400.woff2' },
    { url: 'https://fonts.gstatic.com/s/syne/v22/8vIS7w4qzmVxsWxjBZRjr0FKM_2uuQ.woff2', file: 'Syne-600.woff2' },
    { url: 'https://fonts.gstatic.com/s/syne/v22/8vIS7w4qzmVxsWxjBZRjr0FKM_-uuQ.woff2', file: 'Syne-700.woff2' },
    { url: 'https://fonts.gstatic.com/s/syne/v22/8vIS7w4qzmVxsWxjBZRjr0FKM_muuQ.woff2', file: 'Syne-800.woff2' },
];

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const options = { headers: { 'User-Agent': 'Mozilla/5.0' } };
        https.get(url, options, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                file.close();
                return download(res.headers.location, dest).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                file.close();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (err) => { fs.unlink(dest, () => { }); reject(err); });
    });
}

(async () => {
    for (const f of fonts) {
        const dest = path.join(fontsDir, f.file);
        try {
            await download(f.url, dest);
            console.log('OK:', f.file);
        } catch (e) {
            console.error('FAIL:', f.file, e.message);
        }
    }
    console.log('All done.');
})();
