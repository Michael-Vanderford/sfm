const { parentPort, workerData, isMainThread } = require('worker_threads');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const gio = require('../gio/bin/linux-x64-125/gio');

class DeviceManager {

    constructor() {


    }

    get_devices() {

        gio.get_drives((err, data_arr) => {
            if (err) {
                console.log('error getting drives', err);
                return;
            }
            let filter_arr = data_arr.filter(x => x.name != 'mtp')
            for (let i = 0; i < filter_arr.length; i++) {
                try {
                    // remove file://
                    if (filter_arr[i].path.indexOf('file://') > -1) {
                        filter_arr[i].path = filter_arr[i].path.replace('file://', '');
                        let cmd = `df "${filter_arr[i].path}"`;
                        let size = execSync(cmd).toString().split('\n')[1].split(' ').filter(x => x !== '').slice(1, 4).join(' ');
                        filter_arr[i].size_total = size.split(' ')[0];
                        filter_arr[i].size_used = size.split(' ')[1];
                    }
                } catch (err) {
                    console.log(`error getting devices ${err}`);
                }
            }

            let cmd = {
                cmd: 'devices',
                devices: filter_arr
            }
            parentPort.postMessage(cmd);
        })

    }


}

const deviceManager = new DeviceManager();

if (!isMainThread) {

    parentPort.on('message', (data) => {
        const cmd = data.cmd;
        switch (cmd) {
            case 'get_devices':
                deviceManager.get_devices();
                break;
            default:
                break;
        }
    });

}
