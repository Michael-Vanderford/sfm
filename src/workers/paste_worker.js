const { parentPort, workerData, isMainThread } = require('worker_threads');
const gio = require('../gio/bin/linux-x64-125/gio');
const fs = require('fs');
const path = require('path');


class Utilities {

    constructor() {
        this.files_arr = [];
        this.cp_recursive = 0;
        this.cancel_get_files = false;
    }

    // sanitize file name
    sanitize_file_name(href) {
        return href.replace(/\n/g, ' ').replace(/[^a-z0-9]/gi, '_');
    }

    get_files_arr(source, destination, callback) {

        this.cp_recursive++

        let file = gio.get_file(source);
        file.source = source;
        file.destination = destination;
        this.files_arr.push(file);

        gio.ls(source, (err, dirents) => {

            if (err) {
                return callback(err);
            }
            for (let i = 0; i < dirents.length; i++) {
                let f = dirents[i]
                if (f.filesystem.toLocaleLowerCase() === 'ntfs') {
                    // sanitize file name
                    f.name = f.name.replace(/[^a-z0-9]/gi, '_');
                }
                if (!f.is_symlink) {
                    if (f.is_dir) {
                        this.get_files_arr(f.href, path.format({ dir: destination, base: f.name }), callback)
                    } else {
                        f.source = f.href;
                        f.destination = path.format({ dir: destination, base: f.name });
                        this.files_arr.push(f)
                    }
                }
            }
            if (--this.cp_recursive == 0 || this.cancel_get_files) {
                let file_arr1 = this.files_arr;
                this.files_arr = []
                return callback(null, file_arr1);
            }
        })
    }

    // paste
    poste (copy_arr) {

        let source = '';
        let destination = '';

        let files_arr = [];

        // calculate max bytes to copy
        let max = 0;
        let size = 0;
        copy_arr.forEach((f, i) => {
            // cal size
            size = parseInt(f.size);
            if (size) {
                max += parseInt(f.size);
            }
            // handle directories
            if (f.is_dir) {
                // get recursive files
                this.get_files_arr(f.source, f.destination, (err, dirents) => {
                    if (err) {
                        let msg = {
                            cmd: 'set_msg',
                            msg: err
                        }
                        parentPort.postMessage(msg);
                        return;
                    }
                    dirents.forEach((ff, i) => {
                        files_arr.push(ff);
                    });
                })
            } else {
                files_arr.push(f);
            }
        });

        // sort so we create all the directories first
        files_arr.sort((a, b) => {
            return a.source.length - b.source.length;
        });

        let bytes_copied = 0;
        files_arr.forEach((f, i) => {

            source = f.source;
            destination = f.destination;
            if (f.is_dir) {
                // fs.mkdirSync(destination, { recursive: true });
                gio.mkdir(destination);
            } else {
                // fs.copyFileSync(source, destination);
                gio.cp_async(source, destination, (err, res) => {
                    if (err) {
                        let remove_card = {
                            cmd: 'remove_item',
                            id: f.id
                        }
                        parentPort.postMessage(remove_card);

                        let msg = {
                            cmd: 'set_msg',
                            msg: err
                        }
                        parentPort.postMessage(msg);

                        return;
                    }
                    if (res.bytes_copied > 0) {
                        bytes_copied += parseInt(res.bytes_copied);
                    }
                    let set_progress = {
                        cmd: 'set_progress',
                        status: `Copying ${f.name}`,
                        max: max,
                        value: bytes_copied
                    }
                    parentPort.postMessage(set_progress);

                    if (bytes_copied === max || i === files_arr.length - 1) {
                        let set_progress = {
                            cmd: 'set_progress',
                            max: 0,
                            value: 0
                        }
                        parentPort.postMessage(set_progress);
                    }
                });
            }

        });

        files_arr = [];
        copy_arr = [];

    }

}

const utilities = new Utilities();

if (!isMainThread) {

    parentPort.on('message', (data) => {
        const cmd = data.cmd;
        switch (cmd) {
            case 'paste':
                utilities.poste(data.copy_arr, data.location);
                break;
            case 'cp_template': {

                let dup_idx = 1;
                let f = data;
                while (fs.existsSync(f.destination)) {
                    let ext = path.extname(f.destination);
                    let base = path.basename(f.destination, ext);
                    let dir = path.dirname(f.destination);
                    let new_base = `${base} (Copy ${dup_idx})`;
                    f.destination = path.join(dir, new_base + ext);
                    dup_idx++;
                }
                try {
                    fs.copyFileSync(f.source, f.destination);
                    parentPort.postMessage({ cmd: 'cp_template_done', destination: f.destination });
                } catch (err) {
                    parentPort.postMessage({ cmd: 'msg', msg: err.message });
                }

                break;
            }
            default:
                break;
        }
    });

}