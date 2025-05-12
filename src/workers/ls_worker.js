const { parentPort, workerData, isMainThread } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const gio = require('../gio/bin/linux-x64-125/gio');

class FileManager {

    constructor() {

        this.tag = {
            ts: '',
            name: '',
            pv: ''
        }

        // file object
        this.file_obj = {
            name: '',
            display_name: '',
            href: '',
            content_type: '',
            size: '',
            mtime: '',
            ctime: '',
            atime: '',
            is_dir: false,
        }

    }

    get_files(location) {

        // populate file_obj with file data
        let files_arr = [];

        gio.ls(location, (err, dirents) => {
            if (err) {

                let msg = {
                    cmd: 'set_msg',
                    msg: err
                }
                parentPort.postMessage(msg);
                return;
            }
            dirents.forEach(file => {
                try {
                    let f = file;
                    f.id = btoa(f.href);
                    files_arr.push(f);
                } catch (err) {
                    let msg = {
                        cmd: 'set_msg',
                        msg: err
                    }
                    parentPort.postMessage(msg);
                }

            });
        });



        return files_arr;

    }

}

const fileManager = new FileManager();

if (!isMainThread) {

    parentPort.on('message', (data) => {
        const cmd = data.cmd;
        switch (cmd) {

            // List files in directory
            case 'ls':
                parentPort.postMessage({
                    cmd: 'ls',
                    files_arr: fileManager.get_files(data.location),
                    add_tab: data.add_tab
                });
                break;

            // Get Folder Size for properties view
            case 'get_folder_size': {

                let cmd = `du -sb "${data.source}"`;
                gio.exec(cmd, (err, res) => {

                    if (err) {
                        console.error(`err ${err}`);
                        let msg = {
                            cmd: 'msg',
                            msg: err.message
                        }
                        parentPort.postMessage(msg);
                        return;
                    }

                    let size = parseFloat(res.toString().split('\t')[0])
                    let worker_data = {
                        cmd: 'folder_size_done',
                        source: data.source,
                        size: size
                    }
                    parentPort.postMessage(worker_data);

                });
                break;
            }

            default:
                break;
        }
    });

}
