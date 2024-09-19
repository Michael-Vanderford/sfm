const { app, BrowserWindow, ipcMain, shell, screen, dialog, Menu, MenuItem } = require('electron');
const window = require('electron').BrowserWindow;
const worker = require('worker_threads');
const { execSync } = require('child_process');
const exec = require('child_process').exec;
const fs = require('fs');
const electronReload = require('electron-reload');
const path = require('path');
const os = require('os');
const gio = require('../gio/bin/linux-x64-125/gio');
const { XMLParser } = require('fast-xml-parser');


// // Configure electron-reload
// electronReload(__dirname, {
//     electron: electronPath,
//     forceHardReset: true,
//     hardResetMethod: 'exit'
// });

class SettingsManager {

    constructor() {

        // init settings
        this.settings_has_changed = 0;
        this.settings_file = path.join(app.getPath('userData'), 'settings.json');
        this.setting = {};

        // handle sendsync call from renderer
        ipcMain.on('get_settings', (e) => {
            e.returnValue = this.get_settings();
        })

        ipcMain.on('update_settings', (e, settings) => {
            this.updateSettings(settings);
        });

        // init list view settings
        this.list_view_file = path.join(app.getPath('userData'), 'list_view.json');
        this.list_view_settings = {};

        // return list view settings
        ipcMain.on('get_list_view_settings', (e) => {
            e.returnValue = this.getListViewSetting();
        });

        // update list view settings
        ipcMain.on('update_list_view_settings', (e, list_view_settings) => {
            this.updateListViewSettingSettings(list_view_settings);
        });

    }

    // Get Settings
    get_settings() {
        if (fs.existsSync(this.settings_file)) {
            this.settings = JSON.parse(fs.readFileSync(this.settings_file, 'utf-8'));
        } else {
            let settings = {};
            fs.writeFileSync(this.settings_file, JSON.stringify(settings, null, 4));
        }
        // win.send('settings', this.settings);
        return this.settings;
    }

    // Update settings
    updateSettings(settings) {
        this.settings = settings;
        fs.writeFileSync(this.settings_file, JSON.stringify(this.settings, null, 4));
        win.send('settings', this.settings);
    }

    // Toggle Menubar
    showMenubar() {
        let showMenubar = this.settings['File Menu']['show'];
        console.log(showMenubar);
        if (showMenubar) {
            win.setMenuBarVisibility(true);
        } else {
            win.setMenuBarVisibility(false);
        }
    }

    // list view settings
    getListViewSetting() {
        try {
            this.list_view_settings = JSON.parse(fs.readFileSync(this.list_view_file, 'utf-8'));
        } catch (err) {
            let list_view_settings = {};
            fs.writeFileSync(this.list_view_file, JSON.stringify(list_view_settings, null, 4));
        }
        return this.list_view_settings;
    }

    updateListViewSettingSettings(list_view_settings) {
        this.list_view_settings = list_view_settings;
        fs.writeFileSync(this.list_view_file, JSON.stringify(this.list_view_settings, null, 4));
    }

}

class Utilities {

    constructor() {

        this.is_main = true;

        this.byteUnits = [' kB', ' MB', ' GB', ' TB', 'PB', 'EB', 'ZB', 'YB'];

        this.ls_worker = new worker.Worker('./src/workers/ls_worker.js');
        this.ls_worker.on('message', (data) => {
            if (data.cmd === 'folder_size_done') {
                let folder_data = {
                    source: data.source,
                    size: data.size
                }
                win.send('folder_size', folder_data);
            }
        });

        // Run external command
        ipcMain.on('command', (e, cmd) => {
            exec(cmd, (error, data, getter) => { });
        })

        // listen for open file event
        ipcMain.on('open', (e, location) => {
            this.open(e, location);
        })

        // listen for paste event
        ipcMain.on('paste', (e, copy_arr, location) => {
            this.paste(e, copy_arr, location);
        })

        // listen for move event
        ipcMain.on('move', (e, move_arr, location) => {
            this.move(e, move_arr, location);
        })

        // listen for make directory event
        ipcMain.on('mkdir', (e, location) => {
            this.mkdir(e, path.normalize(location));
        })

        // listen for rename event
        ipcMain.on('rename', (e, source, destination, id) => {
            this.rename(e, source, destination, id);
        })

        // listen for delete event
        ipcMain.on('delete', (e, delete_arr) => {
            this.delete(e, delete_arr);
        })

        // listen for get_disk_space event
        ipcMain.on('get_disk_space', (e, href) => {
            this.get_disk_space(e, href);
        })

        // listen for message from worker
        this.paste_worker = new worker.Worker('./src/workers/paste_worker.js');
        this.paste_worker.on('message', (data) => {
            const cmd = data.cmd;
            switch (cmd) {
                case 'set_progress':
                    win.send('set_progress', data);
                    break;
                case 'remove_item': {
                    win.send('remove_item', data.id);
                    break;
                }
                case 'set_msg': {
                    win.send('set_msg', data.msg);
                    break;
                }
                default:
                    break;
            }

        });

        // init move worker
        this.move_worker = new worker.Worker('./src/workers/move_worker.js');
        this.move_worker.on('message', (data) => {
            const cmd = data.cmd;
            switch (cmd) {
                // case 'set_progress':
                //     win.send('set_progress', data);
                //     break;
                // case 'remove_item': {
                //     win.send('remove_item', data.id);
                //     break;
                // }
                case 'set_msg': {
                    win.send('set_msg', data.msg);
                    break;
                }
                default:
                    break;
            }

        });

        // init home directory
        this.home_dir = os.homedir();

        // listen for get_home_dir event
        ipcMain.handle('get_home_dir', (e) => {
            return this.home_dir;
        });

        // listen for is_main event
        ipcMain.on('is_main', (e, is_main) => {
            this.is_main = is_main;
        });

        ipcMain.on('extract', (e, files_arr, location) => {

            let progress_id = 0;

            for (let i = 0; i < files_arr.length; i++) {

                if (files_arr[i].is_dir) {
                    continue;
                }

                let compression_worker = new worker.Worker('./src/workers/compression_worker.js');
                compression_worker.on('message', (data) => {

                    // console.log('extract cmd', data.cmd);

                    if (data.cmd === 'set_msg') {
                        win.send('set_msg', data.msg, data.has_timeout);
                    }

                    if (data.cmd === 'progress') {
                        win.send('set_progress', data)
                    }

                    if (data.cmd === 'extract_done') {
                        let close_progress = {
                            id: data.id,
                            value: 0,
                            max: 0,
                            msg: ''
                        }
                        win.send('set_progress', close_progress);

                        win.send('remove_item', data.destination);
                        win.send('get_item', gio.get_file(data.destination));
                        e.sender.send('set_msg', 'Done extracting files.', 1);

                    }
                })

                let data = {
                    id: progress_id += 1,
                    cmd: 'extract',
                    location: location,
                    source: files_arr[i].href,
                }
                compression_worker.postMessage(data);

            }
            files_arr = [];
        })

        // Compress
        ipcMain.on('compress', (e, files_arr, location, type, size) => {

            let progress_id = 0;

            let compression_worker = new worker.Worker('./src/workers/compression_worker.js');
            compression_worker.on('message', (data) => {
                if (data.cmd === 'set_msg') {
                    win.send('set_msg', data.msg, data.has_timeout);
                }
                if (data.cmd === 'progress') {
                    win.send('set_progress', data)
                }
                if (data.cmd === 'compress_done') {
                    win.send('remove_item', data.file_path);
                    let f = gio.get_file(data.file_path);
                    if (f) {
                        f.id = btoa(data.file_path);
                        win.send('get_item', f);
                    }
                    let close_progress = {
                        id: data.id,
                        value: 0,
                        max: 0,
                        status: ''
                    }
                    win.send('set_progress', close_progress);
                    win.send('set_msg', 'Done compressing files.');

                }
            })

            let compress_data = {
                id: progress_id += 1,
                cmd: 'compress',
                location: location,
                type: type,
                size: size,
                files_arr: files_arr
            }
            compression_worker.postMessage(compress_data);

        })

        // On Get Folder Size
        ipcMain.on('get_folder_size', (e, href) => {
            this.get_folder_size(e, href);
        })

    }

    // get folder size
    get_folder_size(e, href) {
        this.ls_worker.postMessage({ cmd: 'get_folder_size', source: href });
    }


    // set is main flag
    set_is_main(is_main) {
        console.log(`is_main: ${is_main}`);
        this.is_main = is_main;
    }

    // sanitize file name
    sanitize_file_name(href) {
        return href.replace(/:/g, '_').replace(/\n/g, ' ');
    }

    // open
    open(e, href) {
        shell.openPath(href)
        .then((error) => {
            console.log(error);
        })
    }

    // poste
    paste(e, copy_arr, location) {

        let paste_arr = [];
        let overwrite_arr = [];

        copy_arr.forEach(f => {

            f.destination = this.sanitize_file_name(path.join(location, f.name));
            f.source = f.href;
            f.name = path.basename(f.destination);
            f.href = f.destination;

            // handle duplicate file names
            if (f.location == location && fs.existsSync(f.destination)) {

                let dup_idx = 1;
                while (fs.existsSync(f.destination)) {
                    let ext = path.extname(f.destination);
                    let base = path.basename(f.destination, ext);
                    let dir = path.dirname(f.destination);
                    let new_base = `${base} (Copy ${dup_idx})`;
                    f.destination = path.join(dir, new_base + ext);
                    dup_idx++;
                }
                // update additional attributes so the new files have the correct data
                f.name = path.basename(f.destination);
                f.href = f.destination;

                paste_arr.push(f);

            } else if (fs.existsSync(f.destination)) {
                overwrite_arr.push(f);
            } else {
                paste_arr.push(f);
            }

        });

        // send copy_arr to renderer
        if (paste_arr.length > 0) {

            if (this.is_main) {
                e.sender.send('add_items', paste_arr, location);
            } else {
                // handle updated to location
                // refresh directory stats
            }

            // send copy_arr to worker
            let paste_cmd = {
                cmd: 'paste',
                copy_arr: paste_arr,
                location: location
            }
            this.paste_worker.postMessage(paste_cmd);
        }

        if (overwrite_arr.length > 0) {
            // send overwrite_arr to renderer
            e.sender.send('overwrite_copy', overwrite_arr);
        }

        // clean up
        paste_arr = [];
        overwrite_arr = [];
        copy_arr = [];


        this.is_main = true;
    }

    // move
    move(e, files_arr, location) {

        let move_arr = [];
        let overwrite_arr = [];

        files_arr.forEach(f => {

            f.destination = path.join(location, f.name);
            f.source = f.href;

            // handle duplicate file names
            if (f.location == location && fs.existsSync(f.destination)) {

                let dup_idx = 1;
                while (fs.existsSync(f.destination)) {
                    let ext = path.extname(f.destination);
                    let base = path.basename(f.destination, ext);
                    let dir = path.dirname(f.destination);
                    let new_base = `${base} (Copy ${dup_idx})`;
                    f.destination = path.join(dir, new_base + ext);
                    dup_idx++;
                }
                // update additional attributes so the new files have the correct data
                f.name = path.basename(f.destination);
                f.href = f.destination;

                move_arr.push(f);

            } else if (fs.existsSync(f.destination)) {
                overwrite_arr.push(f);
            } else {
                move_arr.push(f);
            }

        });

        // send copy_arr to renderer
        if (move_arr.length > 0) {

            if (this.is_main) {
                e.sender.send('add_items', move_arr, location);
            } else {
                // handle updated to location
                // refresh directory stats
                e.sender.send('remove_items', move_arr)
            }

            // send copy_arr to worker
            let move_cmd = {
                cmd: 'move',
                move_arr: move_arr,
                location: location
            }
            this.move_worker.postMessage(move_cmd);
        }

        if (overwrite_arr.length > 0) {
            // send overwrite_arr to renderer
            win.send('set_msg', `Error: ${overwrite_arr.length} files already exist in ${location}`);
            // e.sender.send('overwrite_move', overwrite_arr);
        }

        move_arr = [];
        overwrite_arr = [];
        files_arr = [];


    }

    // make directory
    mkdir(e, location) {
        let dir = path.join(location, 'New Folder');
        let idx = 1;
        while (fs.existsSync(dir)) {
            dir = path.join(location, `New Folder (${idx})`);
            idx++;
        }
        fs.mkdirSync(dir);
        let f = gio.get_file(dir);
        f.id = btoa(dir);
        e.sender.send('get_item', f);
        e.sender.send('edit_item', f);
    }

    // rename
    rename(e, source, destination, id) {

        console.log(`source: ${source}, destination: ${destination}`, id);

        if (fs.existsSync(destination)) {
            win.send('set_msg', 'Error: File name already exists.');
            return;
        }

        fs.rename(source, destination, (err) => {

            if (err) {
                win.send('set_msg', err);
                return;
            }

            let f = gio.get_file(destination);
            f.id = id;
            e.sender.send('update_item', f);

        });


    }

    // delete
    delete(e, delete_arr) {
        if (delete_arr.length > 0) {
            delete_arr.forEach(f => {
                if (f.is_dir) {
                    try {
                        fs.rmSync(f.href, { recursive: true });
                        // win.send('remove_item', f.href);
                    } catch (err) {
                        console.error(err);
                    }
                } else {
                    try {
                        fs.unlinkSync(f.href);
                        // win.send('remove_item', f.href);
                    } catch (err) {
                        console.error(err);
                    }
                }

            })
            e.sender.send('remove_items', delete_arr);
            delete_arr = [];
        } else {
            win.send('set_msg', 'Error: No files selected.');
        }
    }

    // get file size
    get_file_size(bytes) {
        let i = -1;
        do {
            bytes = bytes / 1024;
            i++;
        } while (bytes > 1024);
        return Math.max(bytes, 0.1).toFixed(1) + this.byteUnits[i];
    };

    // get disk space
    get_disk_space(e, href) {

        try {
            let options = {
                disksize: this.get_file_size(parseInt(gio.du(href).total)),
                usedspace: this.get_file_size(parseInt(gio.du(href).used)),
                availablespace: this.get_file_size(parseInt(gio.du(href).free))
            }
            let df = [];
            df.push(options);
            win.send('disk_space', df);

        } catch (err) {
            console.log(err);
        }

    }


}

class WorkspaceManager {

    constructor () {

        // Add Workspace
        ipcMain.on('add_workspace', (e, selected_files_arr) => {

            let workspace_file = path.join(app.getPath('userData'), 'workspace.json');
            let workspace_data = JSON.parse(fs.readFileSync(workspace_file, 'utf8'))

            selected_files_arr.forEach(f => {
                let file = gio.get_file(f.href);
                workspace_data.push(file)
            })
            fs.writeFileSync(workspace_file, JSON.stringify(workspace_data, null, 4));
            win.send('get_workspace');
            selected_files_arr = [];
        })

        // Remove Workspace
        ipcMain.on('remove_workspace', (e, href) => {

            let workspace_file = path.join(app.getPath('userData'), 'workspace.json');
            let workspace_data = JSON.parse(fs.readFileSync(workspace_file, 'utf8'));

            let workspace = workspace_data.filter(data => data.href !== href);
            fs.writeFileSync(workspace_file, JSON.stringify(workspace, null, 4));

            win.send('get_workspace');
            // selected_files_arr = [];
        })

        // Get Workspace
        ipcMain.handle('get_workspace', async (e) => {

            let workspace_file = path.join(app.getPath('userData'), 'workspace.json');
            if (!gio.exists(workspace_file)) {
                let workspace_data = [];
                fs.writeFileSync(workspace_file, JSON.stringify(workspace_data, null, 4));
            }
            let workspace_items = JSON.parse(fs.readFileSync(workspace_file, 'utf-8'));
            return workspace_items;

        })

        // Update workspace
        ipcMain.on('rename_workspace', (e, href, workspace_name) => {

            let workspace_file = path.join(app.getPath('userData'), 'workspace.json');
            let workspace_data = JSON.parse(fs.readFileSync(workspace_file, 'utf8'));

            let index = workspace_data.findIndex(data => data.href === href);
            if (index !== -1) {
                workspace_data[index].name = workspace_name;
                fs.writeFileSync(workspace_file, JSON.stringify(workspace_data, null, 4));
                win.send('get_workspace');
            } else {
                console.error("Workspace entry not found with href:", href);
            }

        })

    }

}

class IconManager {

    constructor() {

        this.home = require('os').homedir();
        this.theme_path = this.get_theme_path();

        // Get File Icon
        ipcMain.handle('get_icon', async (e, href) => {
            return await app.getFileIcon(href, { size: 32 }).then(icon => {
                return icon.toDataURL();
            }).catch((err) => {
                // console.log(err);
                return `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADHklEQVRYhe2WX0/yVhzHP8VBW04r0pKIgjDjlRfPC3BX7vXM1+OdMXsPXi9eqEu27DUgf1ICgQrlFGkxnF0sdgrq00dxyZZ9kyb0d2i/n/b8vj0H/teS6vX69xcXF7/4vh9JKdV7j7Ozs+s0fpnlwunp6c/Hx8c/5nK53EcepFar/ZAGYgXg6Ojo6CPG3wqxApDL5bLrMM9kMgnE+fn5qxArAOuSECL5Xa1WX4X4NIB6vY5pmmia9iaEtlyQUqp1Qcznc+I4Rqm/b1kul595frcus5eUzWbJZt9uqVRToJRiMBgk58PhEM/zUEqhlMLzPIbDIfDXU3c6HcIwTAWZCqDdbtPtdgGQUhIEAYZh4HkenudhmiaTyQQpJY1GA9d1abVaz179hwBqtRq6rgMwmUxwHAfHcZBSIqWkWCziOA5BEKCUwjRNhBDMZrP1AHymvhnAtm1GoxHj8RghBEIIxuMxvu+zubmJpmnEcUwYhhiG8dX7pU5BqVQCwLIsoigiDEMqlQoA3W4X27axLIv9/X16vR57e3vJN+AtpXoDYRgynU6Zz+cAFAoF8vn8mwZpzFMBKKVotVq4rkuj0WCxWNBsNun3+wCfn4LZbEY+n8c0TZRSZDIZDg4OkvH/fgoMw+D+/p44jl+c14+mINViJKVkNBqxvb2dfNt938dxHJRSdLtddF3HdV3m8zm9Xo+trS0sy1oxtCzr44vRYDBIVjlN0ygUCskG5LHx1paCxWJBu91OUvDY7bqu43keYRjS6XQIggCA29tbSqUSzWZzPSmIogghRJKCx7XAdV2klAghKJfLyf+VUhiG8e9JwVd7QNd1ptMpURShaRq2bXN3d8discC27RevieOY6XT6vhT4vh8v74yXU/DYhDs7O2iaRhRFPDw8IIQgjmP6/T7FYvHZxhQgiqLYdV39aW1lCm5ubn5frlmWRbVaTSJYKpXY3d1NOl3X9cQsl8tRrVZXzAGur69/W65tLBeurq7+ODw8/FKpVHY2NjZWxt+jOI7nl5eXv56cnPwUBEHv6dhrYRWAuQ7zJ7oH0m0U/0n9CS0Pytp5nRYfAAAAAElFTkSuQmCC`;
            })
            // try {
            //     return await app.getFileIcon(href, { size: 32 }).then(icon => {
            //         return icon.toDataURL();
            //     }).catch((err) => {
            //         // return path.join(this.get_theme_path(), 'default-file.svg');
            //     })
            // } catch (err) {
            // }
        })

        // listen for get_folder_icon event
        ipcMain.on('get_folder_icon', (e, href) => {
            this.get_folder_icon(e, href);
        })

    }

    get_theme_path() {
        let icon_theme = execSync('gsettings get org.gnome.desktop.interface icon-theme').toString().replace(/'/g, '').trim();
        let icon_dir = path.join(__dirname, 'assets', 'icons');
        let theme_path = ''
        try {
            let search_path = [];
            search_path.push(path.join(this.home, '.local/share/icons'),
                path.join(this.home, '.icons'),
                '/usr/share/icons')

            search_path.every(icon_path => {
                let theme_path = path.join(icon_path, icon_theme);
                if (fs.existsSync(theme_path)) {
                    icon_dir = path.join(icon_path, icon_theme);
                    return false;
                } else {
                    icon_dir = path.join(__dirname, 'assets', 'icons', 'kora');
                    return true;
                }
            })
            let icon_dirs = [
                path.join(icon_dir, 'places@2x/48/'),
                path.join(icon_dir, '32x32/places/'),
                path.join(icon_dir, '64x64/places/'),
                path.join(icon_dir, 'places/scalable/'),
                path.join(icon_dir, 'scalable@2x/places/'),
                path.join(icon_dir, 'places/32/'),
                path.join(icon_dir, 'places/48/'),
                path.join(icon_dir, 'places/64/'),
                path.join(icon_dir, 'places/128/'),
                path.join(icon_dir, 'places/symbolic/')
            ];
            icon_dirs.every(icon_dir => {
                if (fs.existsSync(icon_dir)) {
                    theme_path = icon_dir
                    return false;
                } else {
                    theme_path = path.join(__dirname, 'assets/icons/')
                    return true;
                }
            })
            return theme_path;
        } catch (err) {
            console.log(err);
        }
    }

    // get folder icon
    get_folder_icon(e, href) {
        try {

            let folder_icon = `${path.join(this.theme_path, 'default-folder.svg')}`
            if (!fs.existsSync(folder_icon)) {
                folder_icon = `${path.join(this.theme_path, 'folder.png')}`
            }
            e.sender.send('set_folder_icon', href, folder_icon);
        } catch (err) {
            console.log(err);
        }

    }

}

class DeviceManager {

    constructor() {

        this.device_worker = new worker.Worker('./src/workers/device_worker.js');

        // Get Devices
        ipcMain.on('get_devices', (e) => {
            this.device_worker.postMessage({ cmd: 'get_devices' });
        })

        this.device_worker.on('message', (data) => {
            const cmd = data.cmd;
            switch (cmd) {
                case 'devices':
                    win.send('devices', data.devices);
                    break;
                default:
                    break;
            }
        })

        // Monitor USB Devices
        gio.monitor(data => {
            if (data) {
                if (data != 'mtp') {
                    this.device_worker.postMessage({ cmd: 'get_devices' });
                }
            }
        });

    }

}

class NetworkManager {

    constructor() {

        this.network_settings_arr = []

    }

    // Save network settings to network.json
    setNetworkSettings(network_settings) {

        console.log(network_settings)
        if (network_settings.save_connection) {
            try {
                this.network_settings_arr.push(network_settings);
                let network_file = path.join(app.getPath('userData'), 'network.json');
                fs.writeFileSync(network_file, JSON.stringify(this.network_settings_arr, null, 4));
            } catch (err) {
                console.log(err);
            }
        }

    }

    // Get network settings from network.json
    getNetworkSettings() {
        let network_file = path.join(app.getPath('userData'), 'network.json');
        let network_settings = {};
        try {
            network_settings = JSON.parse(fs.readFileSync(network_file, 'utf-8'));
        } catch (err) {
            // fs.copyFileSync(path.join(__dirname, 'assets/config/network.json'), network_file);
            fs.writeFileSync(network_file, JSON.stringify(this.network_settings_arr, null, 4));
            network_settings = JSON.parse(fs.readFileSync(network_file, 'utf-8'));
        }
        return network_settings;
    }

    removeNetworkSettings(href) {

        try {
            let network_file = path.join(app.getPath('userData'), 'network.json');
            let network_settings = JSON.parse(fs.readFileSync(network_file, 'utf-8'));
            let new_network_settings = network_settings.filter(network_setting => network_setting.mount_point.includes(href) === false);
            fs.writeFileSync(network_file, JSON.stringify(new_network_settings, null, 4));
        } catch (err) {
            console.log(err);
        }

    }

    connectNetwork() {
        let cmd = {
            cmd: 'connect_network',
            network_settings: this.getNetworkSettings()
        }
        worker.postMessage(cmd);
    }

}

class FileManager {

    constructor() {

        this.location = '';
        this.watcher_failed = 0;
        this.watcher_enabled = true;

        // send location to worker
        this.ls_worker = new worker.Worker('./src/workers/ls_worker.js');

        // listen for ls event
        ipcMain.on('ls', (e, location) => {
            this.location = location;
            let ls_data = {
                cmd: 'ls',
                location: this.location
            }
            this.ls_worker.postMessage(ls_data);
        })

        // listen for message from worker
        this.ls_worker.on('message', (data) => {
            const cmd = data.cmd;
            switch (cmd) {
                case 'ls':
                    // this.watch(this.location);
                    win.send('ls', data.files_arr);
                    break;
                case 'set_msg':
                    win.send('set_msg', data.msg);
                    break;
                default:
                    break;
            }

        });

        // listen for get_recent_files event
        ipcMain.on('get_recent_files', (e) => {
            this.get_recent_files(e);
        });

        ipcMain.handle('autocomplete', async (e, directory) => {

            let autocomplete_arr = [];
            let dir = path.dirname(directory);
            let search = path.basename(directory);

            try {
                await gio.ls(dir, (err, dirents) => {
                    if (err) {
                        return;
                    }
                    dirents.forEach(item => {
                        if (item.is_dir && item.name.startsWith(search)) {
                            autocomplete_arr.push(item.href + '/');
                        }
                    })
                })

            } catch (err) {

            }
            return autocomplete_arr;
        })

    }

    watch(location) {
        gio.watcher(location, (watcher) => {
            this.watcher_failed = 0;
            if (watcher.event !== 'unknown') {
                // if (watcher.event === 'moved') {

                // }
                // if (watcher.event === 'deleted') {
                //     win.send('remove_card', watcher.filename);
                // }
                // // if (watcher.event === 'created' || watcher.event === 'changed') {
                if (watcher.event === 'created' && this.watcher_enabled) {
                    try {
                        let f = gio.get_file(watcher.filename);
                        if (f) {
                            win.send('get_item', f);
                            if (f.is_dir) {
                                // win.send('get_folder_count', watcher.filename);
                                // win.send('get_folder_size', watcher.filename);
                            }
                        }
                    } catch (err) {
                        // win.send('msg', 'watcher error: ' + err.message);
                        // console.log('watcher error', err)
                    }
                }

                // win.send('clear_folder_size', path.dirname(watcher.filename));
                // get_disk_space(href);
            }
        })
    }

    // get files
    get_files(location) {
        console.log(`getting files for ${location}`);
        this.location = location
        this.ls_worker.postMessage({
            cmd: 'ls',
            location: location
        });
    }

    // get recent files by reading xbel file
    get_recent_files(e) {
        let files_arr = [];
        // get config data directory
        let xbel_file = path.join(utilities.home_dir, '.local/share/', 'recently-used.xbel');
        if (fs.existsSync(xbel_file)) {
            let data = fs.readFileSync(xbel_file, 'utf-8');
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: "@_"
            });
            let res = parser.parse(data);
            res.xbel.bookmark.forEach(b => {
                try {
                    let href = path.normalize(b['@_href'] = b['@_href'].replace('file://', ''));
                    href = decodeURIComponent(href);
                    let f = gio.get_file(href);
                    f.id = btoa(href);
                    files_arr.push(f);
                } catch (err) {
                    // console.error(err);
                }
            })
            // sort files by mtime
            files_arr.sort((a, b) => {
                return b.mtime - a.mtime;
            });
            // send files_arr to renderer
            if (files_arr.length > 0) {
                e.sender.send('recent_files', files_arr);
            }
            files_arr = [];
        }
    }

}

class WindowManager {

    constructor() {

        this.windows = [];
        this.window_settings;

        // init window settings
        this.window_file = path.join(app.getPath('userData'), 'window.json');
        this.get_window_setting();

        ipcMain.on('update_window_settings', (e, window_settings) => {
            this.update_window_settings(window_settings);
        });

    }

    // window settings
    get_window_setting() {
        if (fs.existsSync(this.window_file)) {
            this.window_settings = JSON.parse(fs.readFileSync(this.window_file, 'utf-8'));
        } else {
            let window_settings = {
                window: {
                    width: 1024,
                    height: 600,
                    x: 0,
                    y: 0
                }
            };
            fs.writeFileSync(this.window_file, JSON.stringify(window_settings, null, 4));
        }
    }

    // update window settings
    update_window_settings(window_settings) {
        this.window_settings = window_settings;
        fs.writeFileSync(this.window_file, JSON.stringify(this.window_settings, null, 4));
    }

    // Create main window
    create_main_window() {

        let displayToUse = 0;
        let lastActive = 0;
        let displays = screen.getAllDisplays();

        // Single Display
        if (displays.length === 1) {
            displayToUse = displays[0];
            // Multi Display
        } else {
            // if we have a last active window, use that display for the new window
            if (!displayToUse && lastActive) {
                displayToUse = screen.getDisplayMatching(lastActive.getBounds());
            }

            // fallback to primary display or first display
            if (!displayToUse) {
                displayToUse = screen.getPrimaryDisplay() || displays[3];
            }
        }

        if (this.window_settings.window.x == 0) {
            this.window_settings.window.x = displayToUse.bounds.x + 50
        }

        if (this.window_settings.window.y == 0) {
            this.window_settings.window.y = displayToUse.bounds.y + 50
        }

        let window = new BrowserWindow({
            minWidth: 400,
            minHeight: 400,
            width: this.window_settings.window.width,
            height: this.window_settings.window.height,
            backgroundColor: '#2e2c29',
            x: this.window_settings.window.x,
            y: this.window_settings.window.y,
            webPreferences: {
                nodeIntegration: false, // is default value after Electron v5
                contextIsolation: true, // protect against prototype pollution
                enableRemoteModule: false, // turn off remote
                nodeIntegrationInWorker: true,
                nativeWindowOpen: true,
                preload: path.join(__dirname, 'preload.js'),
                sandbox: false
            },
        });

        // listen for window move
        window.on('move', (e) => {
            setTimeout(() => {
                this.window_settings.window.x = win.getBounds().x;
                this.window_settings.window.y = win.getBounds().y;
                this.update_window_settings(this.window_settings);
            }, 100);
        })

        // Track resizing
        window.on('resize', () => {
            setImmediate(() => {
                // update window settings
                this.window_settings.window.width = window.getBounds().width;
                this.window_settings.window.height = window.getBounds().height;
                this.update_window_settings(this.window_settings);
                // console.log(`Window resized to: ${lastSize[0]}x${lastSize[1]}`);
            }, 100);
        });

        // Track when resize is finished
        // win.on('resized', () => {
        //     console.log('Window resize completed');
        // });

        window.webContents.openDevTools();
        window.loadFile('src/renderer/index.html');
        this.windows.push(window);
        return window;
    }

}

class DialogManager {

    constructor() {



    }

    dialog(data) {

        let bounds = win.getBounds()

        let x = bounds.x + parseInt((bounds.width - 400) / 2);
        let y = bounds.y + parseInt((bounds.height - 350) / 2);

        let dialog = new BrowserWindow({
            width: data.width,
            height: data.height,
            backgroundColor: data.backgroundColor,
            x: x,
            y: y,
            frame: true,
            webPreferences: {
                preload: path.join(__dirname, '..', 'renderer', 'dialogs', 'scripts', data.preload),
            },
        })

        console.log(path.join(__dirname, '..', 'renderer', 'dialogs', 'scripts', data.preload));

        dialog.loadFile(path.join(__dirname, '..', 'renderer', 'dialogs', data.load_file));
        // dialog.webContents.openDevTools()
        return dialog;
    }

}

class MenuManager {

    constructor() {

        // for template creation
        this.paste_worker = new worker.Worker('./src/workers/paste_worker.js');
        this.paste_worker.on('message', (data) => {
            switch (data.cmd) {
                case 'cp_template_done':
                    let f = gio.get_file(data.destination);
                    f.id = btoa(data.destination);
                    win.send('get_item', f);
                    win.send('edit_item', f);
                break;
            }
        });

        this.copy_arr = [];
        // populate copy_arr from renderer for menu
        ipcMain.on('set_copy_arr', (e, copy_arr) => {
            this.copy_arr = copy_arr;
        })

        // get template folder
        ipcMain.handle('get_templates_folder', (e) => {
            return path.join(utilities.home_dir, 'Templates');
        })

        // Main Menu
        this.main_menu = null;
        ipcMain.on('main_menu', (e, destination) => {

            // console.log('destination', destination);

            utilities.set_is_main(true);

            const template = [
                // {
                //     label: 'New Window',
                //     click: () => {
                //         windowManager.createWindow();
                //     }
                // },
                // {
                //     type: 'separator'
                // },
                {
                    label: 'New Folder',
                    click: () => {
                        // utilities.mkdir(e, destination);
                        win.send('context-menu-command', 'mkdir');
                    }
                },
                {
                    id: 'templates',
                    label: 'New Document',
                    submenu: [
                        {
                            label: 'Open Templates Folder',
                            click: () => {
                                e.sender.send('context-menu-command', 'open_templates'),
                                // fileManager.get_files(path.join(utilities.home_dir, 'Templates'));
                                {
                                    type: 'separator'
                                }
                            }
                        }],
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Sort',
                    id: 'sort_menu',
                    submenu: this.sort_menu()
                },
                {
                    type: 'separator'
                },
                // {
                //     label: 'View',
                //     submenu: [
                //         {
                //             label: 'Grid',
                //             click: (e) => {
                //                 win.send('switch_view', 'grid')
                //             }
                //         },
                //         {
                //             label: 'List',
                //             click: () => {
                //                 win.send('switch_view', 'list')
                //             }
                //         },
                //     ]
                // },
                // {
                //     type: 'separator'
                // },
                {
                    id: 'paste',
                    label: 'Paste',
                    click: () => {
                        e.sender.send('context-menu-command', 'paste')
                    }
                },
                {
                    label: 'Select all',
                    click: () => {
                        // e.sender.send('select_all');
                        e.sender.send('context-menu-command', 'select_all')
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Terminal',
                    click: () => {
                        exec(`gnome-terminal --working-directory=${destination}`);
                    }
                },
                {
                    type: 'separator'
                },
                {
                    type: 'separator'
                },
                // {
                //     label: 'Show Hidden',
                //     // icon: path.join(__dirname, 'assets/icons/menu/eye.png'),
                //     checked: false,
                //     click: (e) => {
                //         // e.sender.send('context-menu-command', 'show_hidden')
                //         win.send('toggle_hidden');
                //     }
                // },
                // {
                //     type: 'separator'
                // },
                {
                    label: 'Disk Usage Analyzer',
                    // icon: path.join(__dirname, 'assets/icons/menu/diskusage.png'),
                    click: () => {
                        exec(`baobab ${destination}`);
                    }

                }
            ]

            // Create menu
            this.main_menu = Menu.buildFromTemplate(template)

            // disable paste menu if no items in the copy_arr
            this.enable_paste_menu(this.main_menu);

            let sort_menu_item = this.main_menu.getMenuItemById('sort_menu');
            let sort_submenu_items = sort_menu_item.submenu.items
            for (const item of sort_submenu_items) {
                if (item.id == this.sort) {
                    item.checked = true;
                }
            }

            // Add templates
            this.add_templates_menu(this.main_menu, destination)

            // Show menu
            this.main_menu.popup(BrowserWindow.fromWebContents(e.sender))

        })

        // Folders Menu
        ipcMain.on('folder_menu', (e, f) => {

            const template = [
                {
                    label: 'Open with Code',
                    click: () => {
                        exec(`cd "${f.href}"; code .`, (err) => {
                            win.send('clear');
                            if (err) {
                                return;
                            }
                        })
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: 'New Window',
                    click: () => {
                        createWindow(f.href);
                    }
                },
                {
                    label: 'New Tab',
                    click: () => {
                        ls_worker.postMessage({ cmd: 'ls', source: f.href, tab: 1 });
                    }
                },
                {
                    id: 'launchers',
                    label: 'Open with',
                    submenu: []
                },
                {
                    type: 'separator'
                },
                {
                    type: 'separator'
                },
                {
                    id: 'sort_menu',
                    label: 'Sort',
                    submenu: this.sort_menu()
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Add to workspace',
                    // accelerator: process.platform === 'darwin' ? settings.keyboard_shortcuts.AddWorkspace : settings.keyboard_shortcuts.AddWorkspace,
                    click: () => {
                        e.sender.send('context-menu-command', 'add_workspace');
                    },
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Cut',
                    // icon: path.join(__dirname, 'assets/icons/menu/cut.png'),
                    // accelerator: process.platform === 'darwin' ? settings.keyboard_shortcuts.Cut : settings.keyboard_shortcuts.Cut,
                    click: () => {
                        e.sender.send('context-menu-command', 'cut')
                    }
                },
                {
                    label: 'Copy',
                    // icon: path.join(__dirname, 'assets/icons/menu/copy.png'),
                    // accelerator: process.platform === 'darwin' ? settings.keyboard_shortcuts.Copy : settings.keyboard_shortcuts.Copy,
                    click: () => {
                        e.sender.send('context-menu-command', 'copy')
                    }
                },
                {
                    label: '&Rename',
                    // accelerator: process.platform === 'darwin' ? settings.keyboard_shortcuts.Rename : settings.keyboard_shortcuts.Rename,
                    click: () => {
                        e.sender.send('context-menu-command', 'rename')
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Compress',
                    // icon: path.join(__dirname, 'assets/icons/menu/extract.png'),
                    // accelerator: process.platform === 'darwin' ? settings.keyboard_shortcuts.Compress : settings.keyboard_shortcuts.Compress,
                    submenu: [
                        {
                            label: 'tar.gz',
                            click: () => {
                                e.sender.send('context-menu-command', 'compress')
                            }
                        },
                        {
                            label: 'zip',
                            click: () => {
                                e.sender.send('context-menu-command', 'compress_zip')
                            }
                        },
                    ]
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Delete Permanently',
                    // accelerator: process.platform === 'darwin' ? settings.keyboard_shortcuts.Delete : settings.keyboard_shortcuts.Delete,
                    click: () => {
                        // e.sender.send('context-menu-command', 'delete_folder')
                        e.sender.send('context-menu-command', 'delete')
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Open in terminal',
                    click: () => {
                        e.sender.send('context-menu-command', 'terminal');
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Disk Usage Analyzer',
                    // icon: path.join(__dirname, 'assets/icons/menu/diskusage.png'),
                    click: () => {
                        exec(`baobab ${f.href}`);
                    }

                },
                {
                    type: 'separator'
                },
                {
                    label: 'Properties',
                    // icon: path.join(__dirname, 'assets/icons/menu/properties.png'),
                    // accelerator: process.platform == 'darwin' ? settings.keyboard_shortcuts.Properties : settings.keyboard_shortcuts.Properties,
                    click: () => {
                        e.sender.send('context-menu-command', 'properties')
                    }
                },

            ]

            const menu = Menu.buildFromTemplate(template);

            // Handle Sort Menu
            let sort_menu_item = menu.getMenuItemById('sort_menu');
            let sort_submenu_items = sort_menu_item.submenu.items
            for (const item of sort_submenu_items) {
                if (item.id == this.sort) {
                    item.checked = true;
                }
            }

            // ADD LAUNCHER MENU
            this.add_launcher_menu(menu, e, f)

            // ADD LAUNCHER MENU
            //   add_launcher_menu(menu1, e, args);
            menu.popup(BrowserWindow.fromWebContents(e.sender));

            // menu.on('menu-will-close', () => {
            //     e.sender.send('clear_selection');
            // });

        })

        // Files Menu
        ipcMain.on('file_menu', (e, f) => {

            // const template = [
            let files_menu_template = [
                {
                    id: 'launchers',
                    label: 'Open with',
                    submenu: []
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Add to workspace',
                    // accelerator: process.platform === 'darwin' ? settings.keyboard_shortcuts.AddWorkspace : settings.keyboard_shortcuts.AddWorkspace,
                    click: () => {
                        e.sender.send('context-menu-command', 'add_workspace')
                    }
                },
                {
                    type: 'separator'
                },
                {
                    id: 'sort_menu',
                    label: 'Sort',
                    submenu: this.sort_menu()
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Cut',
                    // accelerator: process.platform === 'darwin' ? settings.keyboard_shortcuts.Cut : settings.keyboard_shortcuts.Cut,
                    click: () => {
                        e.sender.send('context-menu-command', 'cut')
                    }
                },
                {
                    label: 'Copy',
                    // icon: path.join(__dirname, 'assets/icons/menu/copy.png'),
                    // accelerator: process.platform === 'darwin' ? settings.keyboard_shortcuts.Copy : settings.keyboard_shortcuts.Copy,
                    click: () => {
                        e.sender.send('context-menu-command', 'copy')
                    }
                },
                {
                    label: '&Rename',
                    // accelerator: process.platform === 'darwin' ? settings.keyboard_shortcuts.Rename : settings.keyboard_shortcuts.Rename,
                    click: () => { e.sender.send('context-menu-command', 'rename') }
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Compress',
                    // icon: path.join(__dirname, 'assets/icons/menu/extract.png'),
                    // accelerator: process.platform === 'darwin' ? settings.keyboard_shortcuts.Compress : settings.keyboard_shortcuts.Compress,
                    submenu: [
                        {
                            label: 'tar.gz',
                            click: () => {
                                e.sender.send('context-menu-command', 'compress')
                            }
                        },
                        {
                            label: 'zip',
                            click: () => {
                                e.sender.send('context-menu-command', 'compress_zip')
                            }
                        },
                    ]
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Delete Permanently',
                    // accelerator: process.platform === 'darwin' ? settings.keyboard_shortcuts.Delete : settings.keyboard_shortcuts.Delete,
                    click: () => {
                        e.sender.send('context-menu-command', 'delete')
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Properties',
                    // icon: path.join(__dirname, 'assets/icons/menu/properties.png'),
                    // accelerator: process.platform == 'darwin' ? settings.keyboard_shortcuts.Properties : settings.keyboard_shortcuts.Properties,
                    click: () => {
                        e.sender.send('context-menu-command', 'properties')
                    }
                },
            ]

            let menu = Menu.buildFromTemplate(files_menu_template)

            // Handle Sort Menu
            let sort_menu_item = menu.getMenuItemById('sort_menu');
            let sort_submenu_items = sort_menu_item.submenu.items
            for (const item of sort_submenu_items) {
                if (item.id == this.sort) {
                    item.checked = true;
                }
            }

            // ADD LAUNCHER MENU
            this.add_launcher_menu(menu, e, f)

            // Run as program
            // if (args.access) {
            // add_execute_menu(menu, e, args)
            // }

            // Handle Audio conversion
            let ext = path.extname(f.href);
            if (ext == '.mp4' || ext == '.mp3') {
                this.convert_audio_menu(menu, f.href);
            }

            if (ext == '.xz' || ext == '.gz' || ext == '.zip' || ext == '.img' || ext == '.tar') {
                this.extract_menu(menu, e);
            }

            menu.popup(BrowserWindow.fromWebContents(e.sender))

            // menu.on('menu-will-close', (e) => {
            //     e.sender.send('clear_selection');
            // });

        })

        // Devices Menu
        ipcMain.on('device_menu', (e, href, uuid) => {

            let settings = settingsManager.get_settings();

            let device_menu_template = [
                {
                    label: 'Connect',
                    click: () => {
                        this.connect_dialog()
                    }
                },
                {
                    label: 'Unmount',
                    click: () => {
                        execSync(`gio mount -u ${href}`);
                        win.send('msg', `Device Unmounted`);
                        win.send('umount_device');
                    }
                },
                {
                    type: 'separator',
                },
                {
                    label: 'Disks',
                    click: () => {
                        let cmd = settings['disk_utility']
                        exec(cmd, (err) => {
                            console.log(err)
                        });
                    }
                }
                // {
                //     label: 'Properties',
                //     accelerator: process.platform == 'darwin' ? settings.keyboard_shortcuts.Properties : settings.keyboard_shortcuts.Properties,
                //     click: () => {
                //         e.sender.send('context-menu-command', 'properties')
                //     }
                // },
            ]

            let menu = Menu.buildFromTemplate(device_menu_template)
            menu.popup(BrowserWindow.fromWebContents(e.sender))

        })

        // Workspace Menu
        ipcMain.on('workspace_menu', (e, file) => {

            // // console.log(file)
            let workspace_menu_template = [
                {
                    label: 'Rename',
                    click: () => {
                        win.send('edit_workspace', file.href);
                    }
                },
                {
                    type: 'separator',
                },
                {
                    label: 'Remove From Workspace',
                    click: () => {
                        win.send('remove_workspace', file.href);
                    }
                },
                {
                    label: 'Open Location',
                    click: () => {
                        win.send('get_files', path.dirname(file.href))
                    }
                }
            ]

            let menu = Menu.buildFromTemplate(workspace_menu_template)

            // ADD TEMPLATES
            // add_templates_menu(menu, e, args)

            // ADD LAUNCHER MENU
            // add_launcher_menu(menu, e, args.apps)
            menu.popup(BrowserWindow.fromWebContents(e.sender))

            menu.on('menu-will-close', () => {
                win.send('clear_items');
            });

        })

        this.sort = 'date_desc';
        ipcMain.on('sort', (e, sort_by) => {
            this.sort = sort_by
        })

        ipcMain.on('columns_menu', (e) => {
            const menu_template = [
                {
                    label: 'Columns',
                    click: () => {
                        this.columns_dialog();
                    }
                }
            ]
            const menu = Menu.buildFromTemplate(menu_template)
            menu.popup(BrowserWindow.fromWebContents(e.sender))
        })

    }

    connect_dialog() {

        let bounds = win.getBounds()

        let x = bounds.x + parseInt((bounds.width - 400) / 2);
        let y = bounds.y + parseInt((bounds.height - 350) / 2);

        let dialog_properties = {
            width: 400,
            height: 475,
            backgroundColor: '#2e2c29',
            preload: 'connect.js',
            load_file: 'connect.html'
        }

        const connect_win = dialogManager.dialog(dialog_properties);

        // show dialog
        connect_win.once('ready-to-show', () => {
            let title = 'Connect to Server'
            connect_win.title = title
            connect_win.removeMenu()
            connect_win.send('connect')
        })

    }

    columns_dialog() {

        const dialog_properties = {
            width: 400,
            height: 350,
            backgroundColor: '#2e2c29',
            preload: 'columns.js',
            load_file: 'columns.html'
        }
        const dialog = dialogManager.dialog(dialog_properties);

        // let bounds = win.getBounds()

        // let x = bounds.x + parseInt((bounds.width - 400) / 2);
        // let y = bounds.y + parseInt((bounds.height - 350) / 2);


        // let dialog = new BrowserWindow({
        //     // parent: window.getFocusedWindow(),
        //     width: 400,
        //     height: 350,
        //     backgroundColor: '#2e2c29',
        //     x: x,
        //     y: y,
        //     frame: true,
        //     webPreferences: {
        //         // nodeIntegration: false, // is default value after Electron v5
        //         // contextIsolation: true, // protect against prototype pollution
        //         // enableRemoteModule: false, // turn off remote
        //         // nodeIntegrationInWorker: true,
        //         // nativeWindowOpen: true,
        //         // sandbox: true,
        //         preload: path.join(__dirname, 'preload.js'),
        //     },
        // })

        // dialog.loadFile(path.join(__dirname, '..', 'renderer', 'dialogs', 'columns.html'))
        dialog.webContents.openDevTools()

        // SHOW DIALG
        dialog.once('ready-to-show', () => {
            dialog.removeMenu()
            dialog.send('columns');
        })

    }

    // Add Launcher Menu
    add_launcher_menu(menu, e, f) {

        // Populate Open With Menu
        let launchers = gio.open_with(f.href);
        launchers.sort((a, b) => {
            return a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase());
        })

        let launcher_menu = menu.getMenuItemById('launchers')
        try {
            for (let i = 0; i < launchers.length; i++) {
                launcher_menu.submenu.append(new MenuItem({
                    label: launchers[i].name,
                    click: () => {

                        // console.log(launchers[i]);

                        // Set Default Application
                        let set_default_launcher_cmd = `xdg-mime default ${path.basename(launchers[i].appid)} ${launchers[i].mimetype}`;
                        // console.log(set_default_launcher_cmd)
                        execSync(set_default_launcher_cmd);

                        let cmd = launchers[i].cmd.toLocaleLowerCase().replace(/%u|%f/g, `'${f.href}'`);
                        exec(cmd);

                        // shell.openPath(file.href);
                        win.send('clear');

                    }
                }))
            }
            launcher_menu.submenu.append(new MenuItem({
                type: 'separator'
            }))

        } catch (err) {
            // console.log(err)
        }
    }

    // Add Extract Menu
    extract_menu(menu, e) {

        let menu_item = new MenuItem(
            {
                label: '&Extract',
                // accelerator: process.platform === 'darwin' ? settings.keyboard_shortcuts.Extract : settings.keyboard_shortcuts.Extract,
                click: () => {
                    e.sender.send('context-menu-command', 'extract')
                }
            }
        )
        menu.insert(15, menu_item)
    }

    // Add Convert Audio Menu
    convert_audio_menu(menu, href) {

        menu.append(new MenuItem({
            label: 'Audio / Video',
            submenu: [
                {
                    label: 'Convert to Mp3',
                    click: () => {
                        let filename = href.substring(0, href.length - path.extname(href).length) + '.mp3'
                        let cmd = 'ffmpeg -i ' + href + ' ' + filename;
                        exec(cmd, (err, stdout, stderr) => {
                            if (err) {
                                win.send('notification', err);
                            } else {
                                let options = {
                                    id: 0,
                                    href: filename,
                                    linktext: path.basename(filename),
                                    is_folder: false,
                                    grid: ''
                                }
                                win.send('add_card', options)
                            }
                        })

                        cmd = 'ffprobe -i ' + href + ' -show_entries format=size -v quiet -of csv="p=0"'
                        exec(cmd, (err, stdout, stderr) => {
                            if (err) {
                                win.send('notification', err)
                            } else {
                                win.send('progress', parseInt(stdout))
                            }
                        })

                    },
                },
                {
                    label: 'Convert to Ogg Vorbis',
                    click: () => {
                        let filename = href.substring(0, href.length - path.extname(href).length) + '.ogg'
                        let cmd = 'ffmpeg -i ' + href + ' -c:a libvorbis -q:a 4 ' + filename;

                        exec(cmd, (err, stdout, stderr) => {
                            if (err) {
                                win.send('notification', err);
                            } else {
                                let options = {
                                    id: 0,
                                    href: filename,
                                    linktext: path.basename(filename),
                                    is_folder: false,
                                    grid: ''
                                }
                                win.send('add_card', options)
                            }
                        })

                        cmd = 'ffprobe -i ' + href + ' -show_entries format=size -v quiet -of csv="p=0"'
                        exec(cmd, (err, stdout, stderr) => {
                            if (err) {
                                win.send('notification', err)
                            } else {
                                win.send('progress', parseInt(stdout))
                            }
                        })
                    }
                },
            ]

        }))

    }

    enable_paste_menu(menu) {
        if (this.copy_arr.length > 0) {
            menu.getMenuItemById('paste').enabled = true;
        } else {
            menu.getMenuItemById('paste').enabled = false;
        }
    }

    // Templated Menu
    add_templates_menu(menu, location) {
        console.log('adding templates', location);
        let template_menu = menu.getMenuItemById('templates');
        let templates = fs.readdirSync(path.join(utilities.home_dir, 'Templates'));
        templates.forEach((file, idx) => {
            let source = path.join(utilities.home_dir, 'Templates', file);
            let destination = path.format({ dir: location, base: file });
            template_menu.submenu.append(new MenuItem({
                label: file.replace(path.extname(file), ''),
                click: () => {
                    this.create_file_from_template(source, destination);
                }
            }));
        })
    }

    create_file_from_template(source, destination) {
        this.paste_worker.postMessage({ cmd: 'cp_template', source: source, destination: destination });
        win.send('set_msg', `Creating file from template ${source} to ${destination}`);
    }

    sort_menu() {

        let sort;

        let submenu = [
            {
                label: 'Last Modified',
                type: 'radio',
                id: 'date_desc',
                click: () => {
                    sort = 'modified_desc';
                    win.send('sort_cards', sort);
                }
            },
            {
                label: 'First Modified',
                type: 'radio',
                id: 'modified_asc',
                click: () => {
                    sort = 'modified_asc';
                    win.send('sort_cards', sort);
                }
            },
            {
                label: 'A-Z',
                type: 'radio',
                id: 'name_asc',
                click: () => {
                    sort = 'name_asc';
                    win.send('sort_cards', sort)
                }
            },
            {
                label: 'Z-A',
                type: 'radio',
                id: 'name_desc',
                click: () => {
                    sort = 'name_desc';
                    win.send('sort_cards', sort)
                }
            },
            {
                label: 'Size',
                type: 'radio',
                id: 'size',
                click: () => {
                    sort = 'size';
                    win.send('sort_cards', sort)
                }
            },
            {
                label: 'Type',
                type: 'radio',
                id: 'type',
                click: () => {
                    sort = 'type';
                    win.send('sort_cards', sort)
                }
            }
        ]

        this.sort = sort;
        return submenu;

    }

}

const settingsManager = new SettingsManager();
const windowManager = new WindowManager();
const utilities = new Utilities();
const iconManager = new IconManager();
const fileManager = new FileManager();
const workspaceManager = new WorkspaceManager();
const deviceManager = new DeviceManager();
const dialogManager = new DialogManager();
const menuManager = new MenuManager();

// Create main window
let win;
app.on('ready', () => {

    // create main window
    win = windowManager.create_main_window();

    // listen for window close
    ipcMain.on('close-window', (event, data) => {
        windowManager.windows.forEach(window => {
            window.close();
        });
    });

});




// let mainWindow;
// app.on('ready', () => {
//     mainWindow = new BrowserWindow({
//         width: 800,
//         height: 600,
//         webPreferences: {
//         nodeIntegration: true,
//         },
//     });

//     mainWindow.loadFile('src/renderer/index.html');
// });