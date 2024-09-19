const { parentPort, workerData, isMainThread } = require('worker_threads');
const gio = require('../gio/bin/linux-x64-125/gio');
const fs = require('fs');
const path = require('path');


class Utilities {

    constructor() {
        this.move_arr = [];
        this.cp_recursive = 0;
        this.cancel_get_files = false;
    }

//     get_files_arr(source, destination, callback) {

//         this.cp_recursive++
//         this.file_arr.push({ is_dir: true, source: source, destination: destination })
//         gio.ls(source, (err, dirents) => {

//             if (err) {
//                 return callback(err);
//             }
//             for (let i = 0; i < dirents.length; i++) {
//                 let f = dirents[i]
//                 if (f.filesystem.toLocaleLowerCase() === 'ntfs') {
//                     // sanitize file name
//                     f.name = f.name.replace(/[^a-z0-9]/gi, '_');
//                 }
//                 if (!f.is_symlink) {
//                     if (f.is_dir) {
//                         this.get_files_arr(f.href, path.format({ dir: destination, base: f.name }), callback)
//                     } else {
//                         let file_obj = {
//                             type: 'file',
//                             source: f.href,
//                             destination: path.format({ dir: destination, base: f.name }),
//                             size: f.size,
//                             is_symlink: f.is_symlink,
//                             file: f
//                         }
//                         this.file_arr.push(file_obj)
//                     }
//                 }
//             }
//             if (--this.cp_recursive == 0 || cancel_get_files) {
//                 let file_arr1 = this.file_arr;
//                 this.file_arr = []
//                 return callback(null, file_arr1);
//             }
//         })
//     }

    // sanitize file name
    sanitize_file_name(href) {
        return href.replace(/\n/g, ' ');
    }

    // paste
    move (move_arr) {

        let source = '';
        let destination = '';

        let files_arr = [];

        // calculate max bytes to copy
        let max = 0;
        let size = 0;
        move_arr.forEach((f, i) => {
            // cal size
            size = parseInt(f.size);
            if (size) {
                max += parseInt(f.size);
            }
            // handle directories
            if (f.is_dir) {
                // // get recursive files
                // this.get_files_arr(f.source, f.destination, (err, dirents) => {
                //     if (err) {
                //         console.error(err);
                //         return;
                //     }
                //     dirents.forEach((f, i) => {
                //         files_arr.push(f);
                //     });
                // })
            } else {
                files_arr.push(f);
            }

        });

        // sort so we create all the directories first
        files_arr.sort((a, b) => {
            return a.source.length - b.source.length;
        });

        files_arr.forEach((f, i) => {

            source = f.source;
            destination = f.destination;
            if (f.is_dir) {
//                 // fs.mkdirSync(destination, { recursive: true });
            } else {
                // fs.copyFileSync(source, destination);
                try {
                    let bytes_copied = 0;
                    gio.mv(source, destination, (err, res) => {
                        if (err) {
                            let msg = {
                                cmd: 'set_msg',
                                msg: err
                            }
                            parentPort.postMessage(msg);
                            // console.error(err);
                            // return;
                        }
                        bytes_copied += parseInt(res.bytes_copied);
                        let set_progress = {
                            cmd: 'set_progress',
                            max: max,
                            value: bytes_copied
                        }
                        parentPort.postMessage(set_progress);
                        if (bytes_copied === max) {
                            let set_progress = {
                                cmd: 'set_progress',
                                max: 0,
                                value: 0
                            }
                            parentPort.postMessage(set_progress);
                        }
                    });

                } catch (err) {
                    console.error(err);
                }

            }

        });

        files_arr = [];
        move_arr = [];

    }

}

const utilities = new Utilities();

if (!isMainThread) {

    parentPort.on('message', (data) => {
        const cmd = data.cmd;
        switch (cmd) {
            case 'move':
                utilities.move(data.move_arr, data.location);
                break;
            default:
                break;
        }
    });

}