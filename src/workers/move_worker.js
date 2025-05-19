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

    get_files_arr(source, destination, callback) {
        this.cp_recursive++;

        let file;
        try {
            file = gio.get_file(source);
        } catch (err) {
            return callback(new Error(`Error getting file: ${err.message}`));
        }

        file.source = source;
        file.destination = destination;
        this.move_arr.push(file);

        gio.ls(source, (err, dirents) => {
            if (err) {
                return callback(new Error(`Error listing directory: ${err.message}`));
            }

            for (let f of dirents) {
                if (f.filesystem.toLowerCase() === 'ntfs') {
                    f.name = f.name.replace(/[^a-z0-9]/gi, '_');
                }
                f.source = f.href;
                f.destination = path.join(destination, f.name);

                if (f.is_dir) {
                    this.get_files_arr(f.source, f.destination, callback);
                } else {
                    this.move_arr.push(f);
                }
            }

            if (--this.cp_recursive === 0 || this.cancel_get_files) {
                let move_arr_copy = [...this.move_arr];
                this.move_arr = [];
                callback(null, move_arr_copy);
            }
        });
    }

    move(move_arr) {
        let files_arr = [];
        let total_size = 0;

        move_arr.forEach(f => {
            if (f.size) total_size += parseInt(f.size, 10);

            if (f.is_dir) {
                this.get_files_arr(f.source, f.destination, (err, dirents) => {
                    if (err) return console.error(err);
                    files_arr.push(...dirents);
                    // this.process_move(files_arr, total_size);
                });
            } else {
                files_arr.push(f);
            }
        });

        this.process_move(files_arr, total_size);
    }

    process_move(files_arr, total_size) {
        files_arr.sort((a, b) => a.source.length - b.source.length);

        let bytes_copied = 0;
        let completed_files = 0;

        files_arr.forEach((f, index) => {
            if (f.is_dir) {
                fs.mkdirSync(f.destination, { recursive: true });
                completed_files++;
            } else {
                gio.mv(f.source, f.destination, (err, res) => {
                    if (err) {
                        console.log(`Error moving file from ${f.source} to ${f.destination}: ${err.message}`);
                        parentPort.postMessage({
                            cmd: 'set_msg',
                            msg: `Error moving file from ${f.source} to ${f.destination}: ${err.message}`
                        });
                    }
                    bytes_copied += parseInt(res.bytes_copied, 10) || 0;
                    completed_files++;

                    parentPort.postMessage({
                        cmd: 'set_progress',
                        max: total_size,
                        value: bytes_copied
                    });

                    if (completed_files === files_arr.length) {
                        this.cleanup_after_move(files_arr);
                    }
                });
            }
        });
    }

    cleanup_after_move(files_arr) {

        // get directories
        const dirs = files_arr.filter(f => f.is_dir);

        for (let dir of dirs) {
            try {
                fs.rmSync(dir.source, { recursive: true, force: true });
            } catch (err) {
                parentPort.postMessage({
                    cmd: 'set_msg',
                    msg: `Error removing directory ${dir}: ${err.message}`
                });
            }
        }

        parentPort.postMessage({
            cmd: 'set_progress',
            max: 0,
            value: 0
        });
        parentPort.postMessage({
            cmd: 'set_msg',
            msg: `Done moving ${files_arr.length} files.`
        });

        parentPort.postMessage({
            cmd: 'mv_done',
            files_arr: files_arr
        })


    }
}

const utilities = new Utilities();

if (!isMainThread) {
    parentPort.on('message', (data) => {
        if (data.cmd === 'move') {
            utilities.move(data.move_arr);
        } else {
            parentPort.postMessage({
                cmd: 'set_msg',
                msg: `Unknown command: ${data.cmd}`
            });
        }
    });
}


// const { parentPort, workerData, isMainThread } = require('worker_threads');
// const gio = require('../gio/bin/linux-x64-125/gio');
// const fs = require('fs');
// const path = require('path');

// class Utilities {

//     constructor() {
//         this.move_arr = [];
//         this.cp_recursive = 0;
//         this.cancel_get_files = false;
//     }

//     // get_files_arr(source, destination, callback) {
//     //     this.cp_recursive++;
//     //     this.file_arr.push({ is_dir: true, source: source, destination: destination });
//     //     gio.ls(source, (err, dirents) => {
//     //         if (err) {
//     //             return callback(err);
//     //         }
//     //         for (let i = 0; i < dirents.length; i++) {
//     //             let f = dirents[i];
//     //             if (f.filesystem.toLocaleLowerCase() === 'ntfs') {
//     //                 // sanitize file name
//     //                 f.name = f.name.replace(/[^a-z0-9]/gi, '_');
//     //             }
//     //             if (!f.is_symlink) {
//     //                 if (f.is_dir) {
//     //                     this.get_files_arr(f.href, path.format({ dir: destination, base: f.name }), callback);
//     //                 } else {
//     //                     let file_obj = {
//     //                         type: 'file',
//     //                         source: f.href,
//     //                         destination: path.format({ dir: destination, base: f.name }),
//     //                         size: f.size,
//     //                         is_symlink: f.is_symlink,
//     //                         file: f
//     //                     };
//     //                     this.file_arr.push(file_obj);
//     //                 }
//     //             }
//     //         }
//     //         if (--this.cp_recursive == 0 || this.cancel_get_files) {
//     //             let file_arr1 = this.file_arr;
//     //             this.file_arr = [];
//     //             return callback(null, file_arr1);
//     //         }
//     //     });
//     // }

//     get_files_arr(source, destination, callback) {

//         this.cp_recursive++;

//         let file;
//         try {
//             file = gio.get_file(source);
//         } catch (err) {
//             return callback(`Error getting file: ${err.message}`);
//         }

//         file.source = source;
//         file.destination = destination;
//         this.move_arr.push(file);

//         gio.ls(source, (err, dirents) => {

//             if (err) {
//                 return callback(`Error listing directory: ${err.message}`);
//             }
//             for (let i = 0; i < dirents.length; i++) {
//                 let f = dirents[i];
//                 if (f.filesystem.toLocaleLowerCase() === 'ntfs') {
//                     // sanitize file name
//                     f.name = f.name.replace(/[^a-z0-9]/gi, '_');
//                 }
//                 if (f.is_dir) {
//                     this.get_files_arr(f.href, path.format({ dir: destination, base: f.name }), callback);
//                 } else {
//                     f.source = f.href;
//                     f.destination = path.format({ dir: destination, base: f.name });
//                     this.move_arr.push(f);
//                 }
//             }
//             if (--this.cp_recursive == 0 || this.cancel_get_files) {
//                 let move_arr1 = this.move_arr;
//                 this.move_arr = [];
//                 return callback(null, move_arr1);
//             }
//         });
//     }

//     // sanitize file name
//     sanitize_file_name(href) {
//         return href.replace(/\n/g, ' ');
//     }

//     // paste
//     move(move_arr) {
//         let source = '';
//         let destination = '';
//         let files_arr = [];

//         // calculate max bytes to copy
//         let max = 0;
//         let size = 0;
//         move_arr.forEach((f, i) => {
//             // cal size
//             size = parseInt(f.size);
//             if (size) {
//                 max += parseInt(f.size);
//             }
//             // handle directories
//             if (f.is_dir) {
//                 // get recursive files
//                 this.get_files_arr(f.source, f.destination, (err, dirents) => {
//                     if (err) {
//                         console.error(err);
//                         return;
//                     }
//                     dirents.forEach((f, i) => {
//                         files_arr.push(f);
//                     });
//                 })
//             } else {
//                 files_arr.push(f);
//             }
//         });

//         // sort so we create all the directories first
//         files_arr.sort((a, b) => {
//             return a.source.length - b.source.length;
//         });

//         files_arr.forEach((f, i) => {
//             source = f.source;
//             destination = f.destination;
//             if (f.is_dir) {
//                 fs.mkdirSync(destination, { recursive: true });
//             } else {
//                 // fs.copyFileSync(source, destination);
//                 try {
//                     let bytes_copied = 0;
//                     gio.mv(source, destination, (err, res) => {
//                         if (err) {
//                             let msg = {
//                                 cmd: 'set_msg',
//                                 msg: `Error moving file from ${source} to ${destination}: ${err.message}`
//                             };
//                             parentPort.postMessage(msg);
//                             return;
//                         }
//                         bytes_copied += parseInt(res.bytes_copied);
//                         let set_progress = {
//                             cmd: 'set_progress',
//                             max: max,
//                             value: bytes_copied
//                         };
//                         parentPort.postMessage(set_progress);
//                         if (bytes_copied === max || i === files_arr.length - 1) {
//                             let set_progress = {
//                                 cmd: 'set_progress',
//                                 max: 0,
//                                 value: 0
//                             };
//                             parentPort.postMessage(set_progress);

//                             let msg = {
//                                 cmd: 'set_msg',
//                                 msg: `Done moving ${files_arr.length} files.`
//                             };
//                             parentPort.postMessage(msg);

//                             // clean up
//                             files_arr = [];
//                             move_arr = [];
//                             fs.rm(source, { recursive: true });

//                         }
//                     });
//                 } catch (err) {
//                     let msg = {
//                         cmd: 'set_msg',
//                         msg: `Exception caught while moving file from ${source} to ${destination}: ${err.message}`
//                     };
//                     parentPort.postMessage(msg);
//                 }
//             }
//         });

//         files_arr = [];
//         move_arr = [];
//     }
// }

// const utilities = new Utilities();

// if (!isMainThread) {
//     parentPort.on('message', (data) => {
//         const cmd = data.cmd;
//         switch (cmd) {
//             case 'move':
//                 utilities.move(data.move_arr, data.location);
//                 break;
//             default:
//                 let msg = {
//                     cmd: 'set_msg',
//                     msg: `Unknown command: ${cmd}`
//                 };
//                 parentPort.postMessage(msg);
//                 break;
//         }
//     });
// }
