const { parentPort, workerData, isMainThread } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const gio = require('../gio/bin/linux-x64-125/gio');

class Utilities {

    // sanitize file name
    sanitize_file_name(href) {
        return href.replace(/:/g, '_');
    }

    // handle duplicate file names
    get_file_name(file_name) {
        let c = 0;
        while (fs.existsSync(file_name)) {
            ++c;
            file_name = `${file_name} (Copy ${c})`;
        }
        return file_name;
    }

}

let utilities = new Utilities();

if (!isMainThread) {

    parentPort.on('message', (data) => {
        const cmd = data.cmd;
        switch (cmd) {
            // Compress Files
            case 'compress': {

                let location = data.location;
                let type = data.type;
                let size = data.size;
                let files_arr = data.files_arr;
                let progress_id = data.id;

                let c = 0;
                let cmd = '';
                let file_list = files_arr.map(item => `"${path.basename(item.href)}"`).join(' ');

                // Create command for compressed file
                let destination = utilities.sanitize_file_name(path.basename(files_arr[0].href));
                files_arr = [];

                let watcher;
                let setinterval_id;

                if (type === 'zip') {

                    destination = destination.substring(0, destination.length - path.extname(destination).length) + '.zip';
                    cmd = `cd '${location}'; zip -r -q '${destination}' ${file_list}`;

                    // Watch for temporary files created by zip
                    let tmpFileNamePattern = /zi\w+/;
                    let tmpFilePath;
                    watcher = fs.watch(location, (eventType, filename) => {
                        if (eventType === 'rename' && tmpFileNamePattern.test(filename)) {
                            tmpFilePath = path.join(location, filename);
                        }
                    });

                    setinterval_id = setInterval(() => {
                        fs.stat(tmpFilePath, (err, stats) => {
                            if (!err) {

                                let progress_data = {
                                    id: progress_id,
                                    cmd: 'progress',
                                    status: `Compressing "${path.basename(file_path)}"`,
                                    max: Math.round(parseInt(size)),
                                    value: stats.size
                                }
                                parentPort.postMessage(progress_data);

                            }

                        });

                    }, 1000);

                } else {

                    destination = destination.substring(0, destination.length - path.extname(destination).length) + '.tar.gz';
                    cmd = `cd '${location}' && tar czf "${destination}" ${file_list}`;

                    const compressionRatio = 0.5;
                    setinterval_id = setInterval(() => {

                        fs.stat(file_path, (err, stats) => {
                            if (!err) {

                                let progress_data = {
                                    id: progress_id,
                                    cmd: 'progress',
                                    status: `Started compression.`,
                                    max: Math.round(parseInt(size)),
                                    value: stats.size
                                }
                                parentPort.postMessage(progress_data);

                            }

                        });

                    }, 1000);

                }

                let file_path = path.format({ dir: location, base: destination });

                let msg = {
                    cmd: 'set_msg',
                    msg: `Compressing "${path.basename(file_path)}"`,
                    has_timeout: 0
                }
                parentPort.postMessage(msg);

                // execute cmd
                let process = exec(cmd);

                // listen for data
                process.stdout.on('data', (data) => {
                    console.log(data);
                });

                // listen for errors
                process.stderr.on('data', (data) => {

                    clearInterval(setinterval_id);
                    if (watcher) {
                        watcher.close();
                    }

                    let msg = {
                        cmd: 'set_msg',
                        msg: data
                    }

                    parentPort.postMessage(msg);
                    return;

                })

                // listen for process exit
                process.on('close', (code) => {

                    console.log('done compressing files', code);

                    clearInterval(setinterval_id);

                    if (watcher) {
                        watcher.close();
                    }

                    let compress_done = {
                        cmd: 'compress_done',
                        id: progress_id,
                        file_path: file_path,
                    }
                    parentPort.postMessage(compress_done);
                    size = 0;
                    c = 0;

                });

                break;
            }

            // Extract
            case 'extract': {

                // console.log('running extract')

                let location = data.location;
                let progress_id = data.id;
                let source = data.source;
                let ext = ''

                console.log (path.extname(source).toLowerCase());

                let cmd = '';
                let filename = '';
                let make_dir = 1;

                let c = 0;

                switch (true) {
                    case source.indexOf('.zip') > -1:
                        filename = utilities.get_file_name(source.replace('.zip', ''))
                        cmd = `unzip "${source}" -d "${filename}"`;
                        break;
                    case source.indexOf('.tar.gz') > -1:
                        filename = utilities.get_file_name(source.replace('.tar.gz', ''));
                        cmd = `cd "${location}"; /usr/bin/tar -xzf "${source}" -C "${filename}"`;
                        break;
                    case source.indexOf('.tar') > -1:

                        if (source.indexOf('.tar.gz') > -1) {
                            filename = utilities.get_file_name(source.replace('.tar.gz', ''));
                            cmd = `cd "${location}"; /usr/bin/tar -xzf "${source}" -C "${filename}"`;
                            break;
                        }
                        if (source.indexOf('.tar.xz') > -1) {
                            filename = utilities.get_file_name(source.replace('.tar.xz', ''));
                            cmd = `cd "${location}"; /usr/bin/tar -xf "${source}" -C "${filename}"`;
                            break;
                        }
                        if (source.indexOf('.tar.bz2') > -1) {
                            filename = utilities.get_file_name(source.replace('.tar.bz2', ''));
                            cmd = 'cd "' + location + '"; /usr/bin/tar -xjf "' + source + '" -C "' + filename + '"';
                            break;
                        }
                        if (source.indexOf('.tar') > -1) {
                            filename = source.replace('.tar', '');
                            cmd = 'cd "' + location + '"; /usr/bin/tar --strip-components=1 -xzf "' + source + '"';
                            break;
                        }
                        break;
                    case source.indexOf('.gz') > -1:
                        filename = source.replace('.gz', '');
                        cmd = `cd "${location}"; /usr/bin/gunzip -d -k "${source}"`; // | tar -x -C ${filename}"`;
                        make_dir = 0;
                        break;
                    case source.indexOf('.xz') > -1:
                        filename = source.replace('tar.xz', '');
                        filename = filename.replace('.img.xz', '');
                        if (source.indexOf('.img.xz') > -1) {
                            make_dir = 0;
                            cmd = 'cd "' + location + '"; /usr/bin/unxz -k "' + source + '"';
                        } else {
                            cmd = 'cd "' + location + '"; /usr/bin/tar -xf "' + source + '" -C "' + utilities.get_file_name(filename) + '"';
                        }
                        break;
                    case source.indexOf('.bz2') > -1:
                        ext = '.bz2';
                        filename = source.replace('.bz2', '');
                        cmd = 'cd "' + location + '"; /usr/bin/bzip2 -dk "' + source + '"'
                        break;
                }

                if (make_dir) {
                    gio.mkdir(filename)
                    // fs.mkdirSync(filename);
                }

                // GET UNCOMPRESSED SIZE
                // win.send('msg', `Calculating uncompressed size of ${path.basename(source)}`, 0);
                // let setinterval_id = 0;
                let file = gio.get_file(source)
                let ratio = 0.5;
                let max = (parseInt(file.size / 1024) / ratio);
                let current_size = 0;

                let setinterval_id = setInterval(() => {

                    current_size = parseInt(execSync(`du -s '${filename}' | awk '{print $1}'`).toString().replaceAll(',', ''))
                    // console.log(current_size, filename)
                    let progress_opts = {
                        id: progress_id,
                        cmd: 'progress',
                        value: (current_size),
                        max: max,
                        status: `Extracting "${path.basename(filename)}"`
                    }
                    parentPort.postMessage(progress_opts);

                }, 1000);

                console.log(cmd);

                // THIS NEEDS WORK. CHECK IF DIRECTORY EXIST. NEED OPTION TO OVERWRITE
                exec(cmd, { maxBuffer: Number.MAX_SAFE_INTEGER }, (err, stdout, stderr) => {

                    if (err) {

                        let msg = {
                            cmd: 'set_msg',
                            msg: `Error: ${err.message}`
                        }
                        parentPort.postMessage(msg);
                        // gio.rm(filename);
                        clearInterval(setinterval_id);
                        return;
                    }



                    clearInterval(setinterval_id);
                    let extract_done = {
                        id: progress_id,
                        cmd: 'extract_done',
                        source: source,
                        destination: filename
                    }
                    parentPort.postMessage(extract_done);
                    // clearInterval(setinterval_id);

                })

                break;
            }
            default:
                break;
        }
    });

}
