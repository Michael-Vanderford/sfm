const ipcRenderer = require('electron').ipcRenderer;

class EventManager {
    constructor(container) {
        this.container = container || document;
        this.events = {};
    }

    // Method to add an event listener
    addEvent(eventType, selector, callback) {
        if (!this.events[eventType]) {
            this.events[eventType] = [];
            this.container.addEventListener(eventType, (e) => this.handleEvent(e));
        }

        this.events[eventType].push({ selector, callback });
    }

    // Method to handle events
    handleEvent(event) {
        const { type, target } = event;
        if (this.events[type]) {
            this.events[type].forEach(({ selector, callback }) => {
                if (target.matches(selector) || target.closest(selector)) {
                    callback.call(target, event);
                }
            });
        }
    }

    // Method to remove an event listener
    removeEvent(eventType, selector, callback) {
        if (this.events[eventType]) {
            this.events[eventType] = this.events[eventType].filter(
                (entry) => entry.selector !== selector || entry.callback !== callback
            );

            // If no more listeners exist for this event type, remove the main listener
            if (this.events[eventType].length === 0) {
                this.container.removeEventListener(eventType, this.handleEvent);
                delete this.events[eventType];
            }
        }
    }

    // Method to clear all event listeners
    clearAllEvents() {
        for (let eventType in this.events) {
            this.container.removeEventListener(eventType, this.handleEvent);
        }
        this.events = {};
    }
}

class SettingsManager {

    constructor() {

        this.settings = {};
        this.init_settings();

        ipcRenderer.on('settings_updated', (e, updated_settings) => {
            // console.log('settings updated', updated_settings);
            this.settings = updated_settings;
            // fileManager.get_files(this.settings.location);
        })

    }

    init_settings() {

        this.settings = ipcRenderer.sendSync('get_settings');
        if (!this.settings) {
            this.settings = {};
        }

        // view
        if (this.settings.view === '' || this.settings.view === undefined) {
            this.settings.view = 'list_view';
            ipcRenderer.send('update_settings', this.settings);
        }

        // location
        if (this.settings.location === '' || this.settings.location === undefined) {
            let home_dir = ipcRenderer.sendSync('get_home_dir');
            utilities.set_location(home_dir);
            ipcRenderer.send('update_settings', this.settings);
        }

        // disk utility
        if (this.settings.disk_utility === '' || this.settings.disk_utility === undefined) {
            this.settings.disk_utility = 'gnome-disks';
            ipcRenderer.send('update_settings', this.settings);
        }

        // Show columns
        if (this.settings.columns === undefined) {
            this.settings.columns = {
                name: true,
                location: false,
                size: true,
                mtime: true,
                ctime: false,
                atime: false,
                type: false,
                count: false
            }
            ipcRenderer.send('update_settings', this.settings);
        }

        // sort by
        if (this.settings.sort_by === '' || this.settings.sort_by === undefined) {
            this.settings.sort_by = 'mtime';
            this.settings.sort_direction = 'desc';
            ipcRenderer.send('update_settings', this.settings);
        }

        // list view settings
        this.list_view_settings = ipcRenderer.sendSync('get_list_view_settings');
        if (!this.list_view_settings.col_width || this.list_view_settings.col_width === undefined) {
            this.list_view_settings = {
                col_width: {
                    name: 200,
                    location: 100,
                    size: 120,
                    mtime: 120,
                    ctime: 120,
                    atime: 120,
                    type: 100,
                    count: 50
                }
            };
            // console.log('list view settings', this.list_view_settings);
            ipcRenderer.send('update_list_view_settings', this.list_view_settings);
        }

        if (this.settings.icon_size === '' || this.settings.icon_size === undefined) {
            this.settings.icon_size = 32;
            ipcRenderer.send('update_settings', this.settings);
        }

        if (this.settings.list_icon_size === '' || this.settings.list_icon_size === undefined) {
            this.settings.list_icon_size = 32;
            ipcRenderer.send('update_settings', this.settings);
        }

        if (this.settings.show_hidden === undefined) {
            this.settings.show_hidden = true;
            ipcRenderer.send('update_settings', this.settings);
        }

    }

    // get settings
    get_settings() {
        return this.settings;
    }

    // update settings
    update_settings(settings) {
        this.settings = settings;

        console.log('update settings', this.settings);

        ipcRenderer.send('update_settings', this.settings);
    }

    get_window_settings() {
        return ipcRenderer.sendSync('get_window_settings');
    }

    // get view
    get_view() {
        return this.settings.view;
    }

    // get list view settings
    get_list_view_settings() {
        return this.list_view_settings;
    }

    // get location
    get_location() {
        if (!this.settings.location) {
            this.settings.location = ipcRenderer.sendSync('get_home_dir');
        }
        return this.settings.location;
    }

    // set location
    set_location(location) {

        if (location === undefined || location === '') {
            console.log('Error: Setting location. No location found');
            utilities.set_msg('Error: Setting location. No location found');
            return;
        }

        if (location !== this.settings.location) {

            this.settings.location = location;
            this.update_settings(this.settings);
            this.init_settings();

            // ipcRenderer.invoke('update_settings', this.settings).then(res => {
            //     // this.init_settings();
            // })

        }

    }

}

class Utilities {

    constructor() {

        this.listeners = [];

        this.breadcrumbs = document.querySelector('.breadcrumbs');
        this.location_input = document.querySelector('.location');

        if (!this.location_input) {
            return;
        }

        this.location = '';
        this.destination = '';

        this.home_dir = '';
        this.copy_arr = [];
        this.move_arr = [];
        this.cut_arr = [];
        this.formatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });
        this.byteUnits = [' Bytes', ' kB', ' MB', ' GB', ' TB', 'PB', 'EB', 'ZB', 'YB'];

        this.chunk_size = 500;

        this.is_dragging = false;
        this.is_cut_operation = false;

        this.selected_files_size = 0;

        this.location_input.addEventListener('keydown', (e) => {

            // if (e.key === 'Escape') {
            //     e.preventDefault();
            //     e.stopPropagation();
            //     this.hide_location_input();
            // }

            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                this.location = this.location_input.value;
                this.hide_location_input();
                fileManager.get_files(this.location);
            }

        });

        // init autocomplete for location
        this.initAutoComplete();

        // select all
        ipcRenderer.on('select_all', (e) => {
            this.select_all();
        });

        // set progress
        ipcRenderer.on('set_progress', (e, progress_data) => {
            this.set_progress(progress_data);
        });

        // disk space
        ipcRenderer.on('disk_space', (e, data) => {
            this.set_disk_space(data);
        });

        // get home dir
        this.home_dir = ipcRenderer.sendSync('get_home_dir');

        // set message
        ipcRenderer.on('set_msg', (e, msg) => {
            this.set_msg(msg);
        });

        ipcRenderer.on('clear_highlight', (e) => {
            this.clear_highlight();
        });

        ipcRenderer.on('folder_size', (e, folder_data) => {
            this.set_folder_size(folder_data);
        })

    }

    removeAllListeners() {
        listeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        listeners.length = 0;
    }

    // set folder size
    set_folder_size(folder_data) {
        let active_tab_content = tabManager.get_active_tab_content(); //document.querySelector('.active-tab-content');
        let item = active_tab_content.querySelector(`[data-href="${folder_data.source}"]`);
        if (!item) {
            console.log('no data-href found for', folder_data.source);
            return;
        }
        item.dataset.size = folder_data.size;
        let size_item = item.querySelector('.size');
        if (size_item) {
            size_item.textContent = this.get_file_size(folder_data.size);
        } else {
            console.log('no .size found for', folder_data.source);
            return;
        }
    }

    // get home dir
    get_home_dir() {
        return this.home_dir;
    }

    // // set is dragging
    // set_is_dragging(is_dragging) {
    //     this.is_dragging = is_dragging;
    // }

    // get destination
    get_destination() {
        return this.destination;
    }

    // set destination
    set_destination(destination) {
        this.destination = destination;
    }

    // init autocomplete
    initAutoComplete() {

        // Create the popup element
        const popup = this.add_div();
        popup.classList.add('autocomplete-popup'); // Add a CSS class for styling
        let val0 = this.location;
        if (!this.location_input) {
            return;
        }

        this.location_input.addEventListener('input', (e) => {
            if (e.key !== 'Backspace') {
                let val = e.target.value;
                ipcRenderer.invoke('autocomplete', val).then(res => {
                    if (res.length > 0 && val0 !== val) {
                        this.autocomplete_idx = 0;
                        popup.innerHTML = '';
                        res.forEach((dir, i) => {
                            const menu_item = this.add_div(['item']);
                            menu_item.textContent = dir;
                            popup.append(menu_item);
                            menu_item.addEventListener('click', (e) => {
                                fileManager.get_files(dir);
                                popup.remove();
                            })
                            if (i === 0) {
                                menu_item.classList.add('highlight_select');
                            }
                        })
                        // Append the popup to the body
                        const nav_menu = document.querySelector('.navigation');
                        nav_menu.appendChild(popup);
                        // Determine position based on space below and above
                        const windowHeight = window.innerHeight;
                        const popupHeight = popup.offsetHeight;
                        const triggerElement = this.location_input // Replace with your trigger element
                        const triggerRect = triggerElement.getBoundingClientRect();
                        const triggerTop = triggerRect.top;
                        const spaceBelow = windowHeight - (triggerTop + triggerRect.height);
                        const spaceAbove = triggerTop;
                        if (spaceBelow > popupHeight) {
                            popup.style.top = triggerTop + triggerRect.height + 5 + 'px';
                        } else if (spaceAbove > popupHeight) {
                            popup.style.top = triggerTop - popupHeight + 'px';
                        } else {
                            // Handle cases where neither direction has enough space
                            console.warn('Not enough space to display popup!');
                        }
                        popup.style.left = triggerRect.left + 5 + 'px';
                    }
                })
            }
        })

        popup.addEventListener('mouseleave', (e) => {
            popup.remove();
        })

        // Handle keyboard events
        this.location_input.addEventListener('keydown', (e) => {
            this.suggestions = popup.querySelectorAll('.item');
            switch (e.key) {
                case 'ArrowDown': {
                    this.autocomplete_idx = (this.autocomplete_idx + 1) % this.suggestions.length;
                    for (let i = 0; i < this.suggestions.length; i++) {
                        if (i === this.autocomplete_idx) {
                            this.suggestions[i].classList.add('highlight_select');
                            this.location_input.value = this.suggestions[i].innerText;
                        } else {
                            this.suggestions[i].classList.remove('highlight_select');
                        }
                    }
                    break;
                }
                case 'ArrowUp': {
                    this.autocomplete_idx = (this.autocomplete_idx - 1 + this.suggestions.length) % this.suggestions.length;
                    for (let i = 0; i < this.suggestions.length; i++) {
                        if (i === this.autocomplete_idx) {
                            this.suggestions[i].classList.add('highlight_select');
                            this.location_input.value = this.suggestions[i].innerText;
                        } else {
                            this.suggestions[i].classList.remove('highlight_select');
                        }
                    }
                    break;
                }
                case 'Enter': {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.suggestions.length > 0) {
                        this.suggestions.forEach(item => {
                            if (item.classList.contains('highlight_select')) {
                                fileManager.get_files(item.innerText);
                            } else {
                                fileManager.get_files(this.location);
                            }
                        })
                        popup.innerHTML = '';
                        popup.remove();
                    } else {
                    }
                    break;
                }
                case 'Escape': {
                    // this.location_input.value = this.val0;
                    // popup.remove();
                    break;
                }
                case 'Tab': {
                    if (this.suggestions.length > 0) {
                        console.log('tab', this.suggestions.length)
                        e.preventDefault()
                        for (let i = 0; i < this.suggestions.length; i++) {
                            if (this.suggestions[i].classList.contains('highlight_select')) {
                                this.location_input.value = this.suggestions[i].innerText;
                                tabManager.addTabHistory(this.location);
                                popup.innerHTML = '';
                                popup.remove();
                                break;
                            }
                        }
                    }
                    break;
                }
            }
        })

    }

    // set copy arr
    set_copy_arr(copy_arr) {
        this.copy_arr = copy_arr;
    }

    // get copy arr
    get_copy_arr() {
        return this.copy_arr;
    }

    // set move arr
    set_move_arr(move_arr) {
        this.move_arr = move_arr;
    }

    // get move arr
    get_move_arr() {
        return this.move_arr;
    }

    // get disk space
    get_disk_space(href) {
        ipcRenderer.send('get_disk_space', href);
    }

    // get disk space
    set_disk_space(data) {

        let disk_space = document.querySelector('.disk_space')
        disk_space.innerHTML = ''

        if (data.length > 0) {

            let ds = this.add_div();
            let us = this.add_div();
            let as = this.add_div();

            ds.classList.add('item')
            us.classList.add('item')
            as.classList.add('item')

            ds.innerHTML = `Disk Space: ${data[0].disksize}`;
            us.innerHTML = `Used Space: ${data[0].usedspace}`;
            as.innerHTML = `Available: ${data[0].availablespace}`;

            disk_space.append(ds, us, as)

        } else {

        }
    }

    // get date time
    get_date_time(date) {
        try {
            return this.formatter.format(new Date(date * 1000));
        } catch (err) {
            // console.log('gio getDateTime Format error')
        }
    }

    // get file size
    get_file_size(bytes) {
        if (!bytes || bytes <= 0) {
            return "0 bytes";
        }
        if (bytes < 1024) {
            return bytes + this.byteUnits[0]; // show raw bytes
        }

        let i = 0;
        let size = bytes;
        while (size >= 1024 && i < this.byteUnits.length - 1) {
            size = size / 1024;
            i++;
        }
        return size.toFixed(1) + this.byteUnits[i];
    }

    // create a breadcrumbs from location
    get_breadcrumbs(location) {
        // console.log('location', location);
        let breadcrumbs = location.split('/');
        let breadcrumb_div = document.querySelector('.breadcrumbs');

        if (!breadcrumb_div) {
            return;
        }

        console.log('breadcrumbs', breadcrumbs.length, breadcrumbs);

        breadcrumb_div.innerHTML = '';
        breadcrumbs.forEach((breadcrumb, index) => {

            let breadcrumb_spacer = document.createElement('div');
            breadcrumb_spacer.classList.add('breadcrumb_spacer');
            breadcrumb_spacer.innerHTML = '/';

            let breadcrumb_item = document.createElement('div');
            breadcrumb_item.classList.add('breadcrumb_item');
            breadcrumb_item.innerHTML = `${breadcrumb}`;

            breadcrumb_item.addEventListener('click', (e) => {

                e.preventDefault();
                e.stopPropagation();
                let new_location = breadcrumbs.slice(0, index + 1).join('/');
                fileManager.get_files(new_location);

            });

            if (breadcrumb !== '') {
                breadcrumb_div.append(breadcrumb_item);
            }

        });

        // click event for breadcrumbs div
        breadcrumb_div.addEventListener('click', (e) => {
            console.log('breadcrumbs click', e.target);
            e.preventDefault();
            e.stopPropagation();
            this.show_location_input();
        });

    }

    // get location
    get_location() {
        return this.location;
    }

    // set location
    set_location(location) {

        // this.get_breadcrumbs(location);
        if (!this.location_input) {
            return;
        }

        this.location_input.value = location;
        this.location = location;
    }

    // show location
    show_location_input() {
        this.location_input.classList.remove('hidden');
        this.breadcrumbs.classList.add('hidden');
        this.location_input.focus();
    }

    // hide location
    hide_location_input() {
        this.location_input.classList.add('hidden');
        this.breadcrumbs.classList.remove('hidden');
    }

    // get base name
    get_base_name(file_path) {
        file_path = file_path.replace(/\/+$/, '');
        return file_path.split('/').pop();
    }

    // set_msg
    set_msg(msg) {

        try {
            let footer = document.querySelector('.footer');
            let msg_div = footer.querySelector('.msg');
            // check if message contains error
            if (msg.toLocaleLowerCase().includes('error')) {
                msg_div.classList.add('error');
            } else {
                msg_div.classList.remove('error');
            }
            msg_div.innerHTML = '';
            msg_div.innerHTML = `${msg}`;
        } catch (err) {
            console.log('set_msg error', err);
        }

    }

    // add div
    add_div(classlist = []) {
        let div = document.createElement('div')
        if (classlist.length > 0) {
            for (let i = 0; i < classlist.length; i++) {
                div.classList.add(classlist[i])
            }
        }
        return div
    }

    add_item(text) {
        let item = this.add_div();
        item.classList.add('item');
        item.append(text);
        return item;
    }

    // add link
    add_link(href, text) {

        let link = document.createElement('a')
        link.href = href
        link.text = text
        link.onclick = (e) => {
            e.preventDefault()
        }
        return link
    }

    // Add Icon
    add_icon(icon_name) {
        let icon = document.createElement('i');
        icon.classList.add('bi', `bi-${icon_name}`, 'icon');

        let icon_names = icon_name.split(',');
        icon_names.forEach(item => {
            icon.classList.add(item)
        })
        return icon
    }

    add_img(src) {
        let img = document.createElement('img')
        img.width = 32
        img.src = src
        return img
    }

    // chunk select
    chunk_select(idx, elements) {

        const last_idx = Math.min(idx + this.chunk_size, elements.length);
        const chunk = elements.slice(idx, last_idx);

        let start = new Date().getTime();
        chunk.forEach(f => {
            f.classList.add('highlight_select');
        });
        let end = new Date().getTime();
        console.log('chunk select load time', (end - start) / 1000);

        idx += this.chunk_size;

        // Check if more chunks need to be loaded
        if (idx < elements.length) {
            setTimeout(() => {
                this.chunk_select(idx, elements);
            }, 0);
        } else {
            console.log('All chunks loaded');
        }
    }

    // select all
    select_all() {
        let active_tab_content = document.querySelector('.active-tab-content');
        let items = active_tab_content.querySelectorAll('.card, .tr');

        // filter out hidden items
        items = Array.from(items).filter(item => !item.classList.contains('hidden'));
        items.forEach(item => {
            item.classList.add('highlight_select');
        });
        this.set_msg(`Selected ${items.length} items`);
        items = null;
    }

    // copy
    copy() {

        this.copy_arr = this.get_selected_files();

        // send copy arr to MenuManager in main for menu paste operation
        ipcRenderer.send('set_copy_arr', this.copy_arr, this.location);

        this.set_msg(`Copied ${this.copy_arr.length} items at ${this.location}`);

    }

    // cut
    cut() {
        this.is_cut_operation = true;
        this.cut_arr = [];
        this.cut_arr = this.get_selected_files();

        // send copy arr to MenuManager in main for menu paste operation
        ipcRenderer.send('set_copy_arr', this.cut_arr, this.location);

        this.cut_arr.forEach(f => {
            let item = document.querySelector(`[data-id="${f.id}"]`);
            item.classList.add('cut');
        });
        this.set_msg(`Cut ${this.cut_arr.length} items at ${this.location}`);
    }

    // paste
    paste() {
        console.log('running paste', this.destination);
        // check if cut operation
        if (this.is_cut_operation) {
            if (this.cut_arr.length > 0) {
                ipcRenderer.send('move', this.cut_arr, this.destination);
            } else {
                this.set_msg('Nothing to move');
            }
        } else {
            if (this.copy_arr.length > 0) {
                console.log('paste', this.copy_arr, this.destination);
                ipcRenderer.send('paste', this.copy_arr, this.destination);
            } else {
                this.set_msg('Nothing to paste');
            }
        }
        // reset destination to location
        this.destination = this.location;
        this.is_cut_operation = false;
        this.copy_arr = [];
        this.cut_arr = [];
        this.clear_highlight();
        this.clear_empty_folder();
    }

    // move
    move() {
        this.move_arr = this.get_selected_files();
        if (this.move_arr.length > 0) {
            console.log('move', this.move_arr, this.destination);
            ipcRenderer.send('move', this.move_arr, this.destination);
            this.set_msg(`Move ${this.move_arr.length} items to ${this.destination}`);
        } else {
            this.set_msg('Nothing to move');
        }
        // reset destination to location
        this.destination = this.location;
        this.move_arr = [];
        this.clear_highlight();
    }

    cancel_edit() {

        let active_tab_content = tabManager.get_active_tab_content(); //document.querySelector('.active-tab-content');
        let items = active_tab_content.querySelectorAll('.card, .tr');
        items.forEach(item => {

            let name = item.querySelector('.href');
            if (name) {
                name.classList.remove('hidden');
            } else {
                // console.log('no .href found on', item)
                return;
            }

            let input = item.querySelector('input');
            if (input) {
                input.classList.add('hidden');
                input.removeEventListener('focus', this.focus_input);
            } else {
                console.log('no input found on', item)
                return;
            }
        });
        items = null;

        let location = document.querySelector('.placeholder');
        if (location) {
            location.focus();
        } else {
            console.log('no .placeholder found');
        }

    }

    // edit -
    edit() {

        console.log('running edit');

        let active_tab_content = tabManager.get_active_tab_content();
        let items = active_tab_content.querySelectorAll('.highlight_select, .highlight');

        if (items.length > 0) {

            items.forEach((item, idx) => {

                let edit_name = item.querySelector('.href');
                if (edit_name) {
                    edit_name.classList.add('hidden');
                } else {
                    console.log('no .href found on', item)
                    return;
                }

                // get input by

                let input = item.querySelector('.edit_name');
                if (input) {
                    input.classList.remove('hidden');
                    if (idx === 0) {
                        setTimeout(() => {
                            input.focus();
                            input.setSelectionRange(0, input.value.lastIndexOf('.'));
                        }, 1);
                    }

                } else {
                    this.set_msg('No input found for edit');
                    return;
                }

            });
        } else {
            this.set_msg('Nothing to edit');
        }

        // active_tab_content.style.display = 'none';
        // active_tab_content.offsetHeight; // Force a reflow
        // active_tab_content.style.display = '';

    }

    focus_input(e) {
        setTimeout(() => {
            e.target.focus();
            e.target.setSelectionRange(0, e.target.value.lastIndexOf('.'));
        }, 1);
    }

    // rename file
    rename(source, destination, id) {

        if (source === undefined || source === '') {
            utilities.set_msg('No valid source found for rename');
            this.cancel_edit();
            return;
        }

        if (destination === undefined || destination === '') {
            utilities.set_msg('No valid destination found for rename');
            this.cancel_edit();
            return;
        }

        if (id === undefined || id === '') {
            utilities.set_msg('No valid id found for rename');
            this.cancel_edit();
            return;
        }

        ipcRenderer.send('rename', source, destination, id);

    }

    // mkdir
    mkdir() {

        if (this.destination === undefined || this.destination === '') {
            utilities.set_msg('No valid destination found for mkdir');
            return;
        }

        ipcRenderer.send('mkdir', this.destination);
    }

    // delete
    delete() {
        let delete_arr = this.get_selected_delete_files();
        if (delete_arr.length > 0) {
            ipcRenderer.send('delete', delete_arr);
            this.set_msg(`Deleting ${delete_arr.length} items`);
        } else {
            this.set_msg('Nothing to delete');
        }
        delete_arr = [];
        // fileManager.check_for_empty_folder();
    }

    //
    extract() {
        let files_arr = this.get_selected_files();
        let location = this.get_location();
        ipcRenderer.send('extract', files_arr, location);
        files_arr = [];
        this.clear_highlight();
        this.set_msg('Extracting files.');
    }

    // Compress Files
    compress(type) {
        let selected_files = this.get_selected_files();
        let location = this.get_location();
        ipcRenderer.send('compress', selected_files, location, type, this.selected_files_size);
        this.clear_highlight();
        selected_files = [];
    }

    // set progress
    set_progress(progress_data) {

        let progress = document.querySelector('.progress');
        progress.classList.remove('hidden');
        let progress_status = document.querySelector('.progress_status');
        progress_status.innerHTML = progress_data.status;
        if (progress_data.max === 0) {
            progress_status.innerHTML = '';
            progress.classList.add('hidden');
        }

        let progress_bar = document.querySelector('.progress_bar');
        progress_bar.max = progress_data.max;
        progress_bar.value = progress_data.value;
    }

    // lazy load icons
    lazy_load_icons(table) {

        let lazyItems = table.querySelectorAll(".lazy");

        // listen for scroll event
        if ("IntersectionObserver" in window) {
            let observer = new IntersectionObserver(function (entries, observer) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        loadImage(entry.target, observer);
                    }
                });
            });

            // Immediately load images that are already in viewport
            lazyItems.forEach(function (lazyImage) {
                if (isInViewport(lazyImage)) {
                    setTimeout(() => {
                        loadImage(lazyImage, observer);
                    }, 10);
                } else {
                    observer.observe(lazyImage);
                }
            });

            function isInViewport(element) {
                const rect = element.getBoundingClientRect();
                return (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                );
            }

            // Function to load the image
            function loadImage(lazyImage, observer) {
                const src = lazyImage.dataset.src;
                if (src) {
                    lazyImage.src = src;
                    lazyImage.classList.remove("lazy");
                    observer.unobserve(lazyImage);
                } else {
                    console.log('No image to load');
                }
            }

        } else {
            // Possibly fall back to a more compatible method here
        }

    }

    // clear selection
    clear() {

        // console.log('clear selection');

        // clear inputs
        this.cancel_edit();

        this.hide_location_input();

        // clear filter
        let filter = document.querySelector('.filter');
        if (filter) {
            filter.innerHTML = '';
        }

        // clear tab highlight
        let tabs = document.querySelectorAll('.tab');
        if (tabs.length > 0) {
            tabs.forEach(tab => {
                tab.classList.remove('highlight_select');
            });
        }

        // clear highlighted all highlighted items
        // let active_tab_content = document.querySelector('.active-tab-content');
        // let main = document.querySelector('.main');
        // let items = main.querySelectorAll('.highlight, .highlight_select, .highlight_target');
        // items.forEach(item => {
        //     item.classList.remove('highlight_select', 'highlight', 'highlight_target');
        // });
        // items = null;
        this.clear_highlight();

        // clear sidebar highlight
        let sidebar = document.querySelector('.sidebar');
        let sidebar_items = sidebar.querySelectorAll('.item');
        sidebar_items.forEach(item => {
            item.classList.remove('highlight_select', 'highlight');
        });

        // clear workspace
        let workspace_items = document.querySelectorAll('.workspace_item');
        if (workspace_items) {
            workspace_items.forEach(i => {
                let input_div = i.querySelector('.input_div');
                let href_div = i.querySelector('.href_div');
                if (input_div) {
                    input_div.classList.add('hidden');
                }
                if (href_div) {
                    href_div.classList.remove('hidden');
                }
            });
        }

        // set is dragging to false
        // dragSelect.set_is_dragging(false);

        // this.set_msg('');
    }

    // clear highlighted items
    clear_highlight() {

        console.log('clear highlight');

        let main = document.querySelector('.main');
        let items = main.querySelectorAll('.highlight_select, .highlight, .highlight_target');
        items.forEach(item => {
            item.classList.remove('highlight_select', 'highlight', 'highlight_target');
        });
    }

    // clear filter
    clear_filter() {
        let filter = document.querySelector('.filter');
        if (filter) {
            filter.innerHTML = '';
            filter.classList.remove('active');
        }
    }

    // clear empty folder message
    clear_empty_folder() {
        let empty_folder = document.querySelector('.empty_msg');
        if (empty_folder) {
            empty_folder.innerHTML = '';
        }
    }

    // get selected files
    get_selected_files() {

        let selected_files = [];
        let active_tab_content = tabManager.get_active_tab_content(); //document.querySelector('.active-tab-content');
        let items = active_tab_content.querySelectorAll('.highlight, .highlight_select');

        if (items.length === 0) {
            this.set_msg('No items selected');
            return selected_files;
        }

        items.forEach(item => {

            // check item.dataset values
            if (!item.dataset.id || !item.dataset.name || !item.dataset.href) {
                console.log('missing dataset values', item);
                return;
            }

            let files_obj = {
                id: item.dataset.id,
                name: item.dataset.name,
                display_name: item.dataset.name,
                href: item.dataset.href,
                size: item.dataset.size,
                mtime: item.dataset.mtime,
                ctime: item.dataset.ctime,
                atime: item.dataset.atime,
                is_dir: this.stob(item.dataset.is_dir),
                content_type: item.dataset.content_type,
                is_hidden: this.stob(item.dataset.is_hidden),
                is_writable: this.stob(item.dataset.is_writable),
                location: item.dataset.location
            }
            selected_files.push(files_obj);
            this.selected_files_size += parseInt(item.dataset.size);
        });

        return selected_files;
    }

    // get selected delete files
    get_selected_delete_files() {
        let selected_files = this.get_selected_files();
        return selected_files;
    }

    // convert string to boolean
    stob(string_val) {

        if (string_val === undefined) {
            console.log('stob: string_val is undefined');
            return -1;
        }

        let bool_val = true;
        if (string_val.toLocaleLowerCase() === 'true') {
            console.log('true');
            bool_val = true;
        } else if (string_val.toLocaleLowerCase() === 'false') {
            bool_val = false;
        } else {
            bool_val = -1;
        }
        return bool_val;
    }

    // sort
    sort(files_arr, sort_by, sort_direction) {

        const sortFunctions = {
            name: (a, b) => a.name.localeCompare(b.name),
            size: (a, b) => a.size - b.size,
            mtime: (a, b) => a.mtime - b.mtime,
            ctime: (a, b) => a.ctime - b.ctime,
            atime: (a, b) => a.atime - b.atime
        };

        return files_arr.sort((a, b) => {

            // First, separate directories and files
            if (a.is_dir !== b.is_dir) {
                return a.is_dir ? -1 : 1;
            }

            // Sort by hidden status last
            if (a.name.startsWith('.') !== b.name.startsWith('.')) {
                return a.name.startsWith('.') ? 1 : -1;
            }

            // If both are directories or both are files, sort based on the specified criteria
            if (sort_by in sortFunctions) {
                const sortFunction = sortFunctions[sort_by];
                const result = sortFunction(a, b);
                return sort_direction === 'asc' ? result : -result;
            }

            return 0;
        });
    }

}

class DragSelect {

    constructor() {

        this.items = [];

        this.key = null;
        this.is_dragging = false;
        this.is_selecting = false;
        this.is_scrolling = false;
        this.allow_click = false;
        this.allow_add = false;
        this.initialSelectionState = null;
        this.drag_select_arr = new Set();
        this.startPosX = 0;
        this.startPosY = 0;
        this.endPosX = 0;
        this.endPosY = 0;

    }

    // set is dragging
    set_is_dragging(is_dragging) {
        this.is_dragging = is_dragging;
    }

    // Initialize the drag select functionality
    initialize() {

        const selectionRectangle = document.querySelector('.selection-rectangle');
        const active_tab_content = document.querySelector('.active-tab-content');

        if (!selectionRectangle || !active_tab_content) {
            console.error('Missing required elements.');
            return;
        }

        // Set draggable property for current items (do this after DOM updates as needed)
        Array.from(active_tab_content.querySelectorAll('.tr, .card')).forEach(item => {
            item.draggable = true;
        });

        // Delegated event listeners for .tr and .card elements

        // Prevent mousedown bubbling
        active_tab_content.addEventListener('mousedown', (e) => {
            const item = e.target.closest('.tr, .card');
            if (item) {
                e.stopPropagation();
            } else {
                this.startSelection(e, selectionRectangle, active_tab_content);
            }
        });

        // Mouseover/mouseout for highlight
        active_tab_content.addEventListener('mouseover', (e) => {
            const item = e.target.closest('.tr, .card');
            if (item) {
                item.classList.add('highlight');
            }
        });
        active_tab_content.addEventListener('mouseout', (e) => {
            const item = e.target.closest('.tr, .card');
            if (item) {
                item.classList.remove('highlight');
            }

        });

        // Dragstart
        active_tab_content.addEventListener('dragstart', (e) => {
            const item = e.target.closest('.tr, .card');
            if (item) {
                e.stopPropagation();
                console.log('dragstart');
                this.is_dragging = true;
                this.is_dragging_divs = true;
                e.dataTransfer.effectAllowed = "copyMove"; // ADD THIS LINE
            }
        });

        // Dragover
        active_tab_content.addEventListener('dragover', (e) => {
            const item = e.target.closest('.tr, .card');
            if (item) {

                e.preventDefault();
                e.stopPropagation();

                console.log('ctrlKey', e.ctrlKey, 'dropEffect', e.dataTransfer.dropEffect);

                if (item.dataset.is_dir === 'true') {
                    if (!item.dataset.dragover) {
                        item.dataset.dragover = 'true';
                        item.classList.add('highlight_target');
                    }
                    if (e.ctrlKey) {
                        e.dataTransfer.dropEffect = "copy";
                        utilities.set_msg(`Copy items to ${item.dataset.href}`);
                    } else {
                        e.dataTransfer.dropEffect = "move";
                        utilities.set_msg(`Move items to ${item.dataset.href}`);
                    }
                    utilities.set_destination(item.dataset.href);
                    utilities.set_msg(`Destination: ${item.dataset.href}`);
                }
            }
        });

        // Dragleave
        active_tab_content.addEventListener('dragleave', (e) => {
            const item = e.target.closest('.tr, .card');
            if (item && item.dataset.dragover === 'true') {
                delete item.dataset.dragover;
                item.classList.remove('highlight_target');
            }
        });

        // Drop
        active_tab_content.addEventListener('drop', (e) => {
            const item = e.target.closest('.tr, .card');
            if (item) {
                e.preventDefault();
                e.stopPropagation();

                // ipcRenderer.send('is_main', 0);
                if (!item.classList.contains('highlight') && item.classList.contains('highlight_target')) {
                    utilities.copy();
                    if (e.ctrlKey) {
                        utilities.paste();
                    } else {
                        utilities.move();
                    }
                } else {
                    console.log('did not find target')
                    ipcRenderer.send('is_main', 1);
                    utilities.copy();
                    utilities.paste();
                }
                utilities.clear();
                this.set_is_dragging(true);
            }
        });

        // Selection rectangle and scroll handling
        active_tab_content.addEventListener('mousemove', (e) => this.updateSelection(e, selectionRectangle, active_tab_content));
        active_tab_content.addEventListener('mouseup', (e) => this.endSelection(e, selectionRectangle, this.items));
        active_tab_content.addEventListener('click', (e) => this.handleOutsideClick(e, active_tab_content));

        active_tab_content.addEventListener('scroll', (e) => {
            console.log('scroll');
            if (this.is_selecting) {
                this.is_scrolling = true;
            }
        });
    }

    // Start selection
    startSelection(e, selectionRectangle, active_tab_content) {

        e.stopPropagation();

        // validate selection rectangle
        if (!selectionRectangle) {
            console.error('Missing selection rectangle element.');
            return;
        }

        // validate active tab content
        if (!active_tab_content) {
            console.error('Missing active tab content element.');
            return;
        }

        if (e.button === 2) return; // Ignore right-click

        this.is_selecting = true;
        this.is_dragging = false;

        this.startPosX = e.clientX;
        this.startPosY = e.clientY;

        selectionRectangle.style.left = `${this.startPosX}px`;
        selectionRectangle.style.top = `${this.startPosY}px`;
        selectionRectangle.style.width = '0';
        selectionRectangle.style.height = '0';
        selectionRectangle.style.display = 'block';

        // Prevent text selection
        active_tab_content.style.userSelect = 'none';

    }

    // Update selection rectangle and highlight items
    updateSelection(e, selectionRectangle, active_tab_content) {

        if (!selectionRectangle || !active_tab_content) {
            console.error('Missing required elements');
            return;
        }

        if (!this.is_selecting || this.is_dragging) return;

        // Always get fresh DOM references
        const currentItems = Array.from(active_tab_content.querySelectorAll('.tr, .card'));

        this.endPosX = e.clientX;
        this.endPosY = e.clientY;

        const rectWidth = this.endPosX - this.startPosX;
        const rectHeight = this.endPosY - this.startPosY;

        selectionRectangle.style.width = `${Math.abs(rectWidth)}px`;
        selectionRectangle.style.height = `${Math.abs(rectHeight)}px`;
        selectionRectangle.style.left = rectWidth > 0 ? `${this.startPosX}px` : `${this.endPosX}px`;
        selectionRectangle.style.top = rectHeight > 0 ? `${this.startPosY}px` : `${this.endPosY}px`;

        // Track initial state using current DOM elements
        if (!this.initialSelectionState && (e.ctrlKey || this.is_scrolling)) {
            this.initialSelectionState = new Set(
                currentItems.filter(item => item.classList.contains('highlight_select'))
            );
        }

        currentItems.forEach(item => {

            const itemRect = item.getBoundingClientRect();
            const isWithinSelection = this.isWithinSelection(itemRect);

            if (e.ctrlKey || this.is_scrolling) {
                if (isWithinSelection && !this.initialSelectionState.has(item)) {
                    item.classList.add('highlight_select');
                    this.drag_select_arr.add(item);
                }
                // Keep initially selected items highlighted
                this.initialSelectionState.forEach(initialItem => {
                    if (!currentItems.includes(initialItem)) return;  // Skip stale elements
                    initialItem.classList.add('highlight_select');
                    this.drag_select_arr.add(initialItem);
                });
            } else {
                if (isWithinSelection) {
                    item.classList.add('highlight_select');
                    this.drag_select_arr.add(item);
                } else {
                    item.classList.remove('highlight_select');
                    this.drag_select_arr.delete(item);
                }
            }
        });

        if (!e.ctrlKey) {
            this.initialSelectionState = null;
        }
    }

    // End selection
    endSelection(e, selectionRectangle) {

        // e.stopPropagation();

        this.is_selecting = false;
        selectionRectangle.style.display = 'none';

        // Restore text selection
        document.querySelector('.active-tab-content').style.userSelect = '';

        // Ensure selected items are kept highlighted
        this.drag_select_arr.forEach(item => item.classList.add('highlight_select'));

        setTimeout(() => {
            this.allow_click = true;
            this.is_dragging = false;
        }, 100);

    }

    // Check if an item is within the selection rectangle
    isWithinSelection(itemRect) {
        return (
            ((itemRect.left < this.endPosX && itemRect.right > this.startPosX) ||
                (itemRect.left < this.startPosX && itemRect.right > this.endPosX)) &&
            ((itemRect.top < this.endPosY && itemRect.bottom > this.startPosY) ||
                (itemRect.top < this.startPosY && itemRect.bottom > this.endPosY))
        );
    }

    // Handle click outside selected items
    handleOutsideClick(e) {

        if (this.is_dragging) {
            return;
        }

        if (e.ctrlKey) {
            // console.log('allow add true');
            this.allow_add = true;
        } else {
            // console.log('allow add false');
            this.allow_add = false;
        }

        if (!this.allow_click) {
            // console.log('not allow click');
            return;
        }

        let clickedItem = e.target.closest('.tr, .card');

        if (!this.allow_add & (!clickedItem || !this.drag_select_arr.has(clickedItem))) {
            setTimeout(() => {
                this.clearSelection();
            }, 100);
        }

    }

    // Clear selection
    clearSelection() {

        console.log('clear selection');

        let active_tab_content = document.querySelector('.active-tab-content');
        if (!active_tab_content) {
            console.error('Missing active tab content element.');
            return;
        }

        // this.drag_select_arr.forEach(item => {
        //     // console.log('clearing selection', item);
        //     item.classList.remove('highlight_select');
        //     item.classList.remove('highlight');
        //     item.classList.remove('highlight_target');
        // });

        utilities.clear_highlight();

        this.allow_click = false;
        this.drag_select_arr.clear();

    }

}

class DeviceManager {

    constructor() {

        this.sidebar = document.querySelector('.sidebar');
        if (!this.sidebar) {
            return;
        }

        this.device_view = this.sidebar.querySelector('.device_view');
        // if (!this.device_view) {
        //     this.device_view = utilities.add_div(['device_view']);
        // }

        this.device_arr = [];

        ipcRenderer.send('get_devices');

        ipcRenderer.on('devices', (e, devices) => {
            this.device_arr = devices;
            this.get_devices();
        });

        ipcRenderer.on('add_device', (e, device) => {
            this.add_device(device, this.device_view);
        })

        this.device_view.addEventListener('contextmenu', (e) => {
            ipcRenderer.send('device_menu', '', '');
        })

    }

    get_type(path) {
        let type = '';
        if (path.match('mtp://')) {
            type = 'phone'
        } else if (path.match('sftp://')) {
            type = 'network'
        } else if (path.match('usb://')) {
            type = 'usb'
        } else {
            type = 'drive'
        }
        return type;
    }

    get_devices(callback) {

        this.device_view.innerHTML = '';

        if (this.device_view) {

            this.device_view.append(document.createElement('hr'));

            this.device_arr.sort((a, b) => {
                // First, compare by 'type'
                if (a.type < b.type) return -1;
                if (a.type > b.type) return 1;
                return a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase());
            })

            this.device_arr.forEach(device => {
                this.add_device(device);
            })

            this.sidebar.append(this.device_view);
            this.device_arr = [];

        }
    }

    // add device to the device view
    add_device(device) {

        let item = utilities.add_div();
        let icon_div = utilities.add_div();
        let href_div = utilities.add_div();
        let umount_div = utilities.add_div();

        item.classList.add('flex', 'item');
        item.style = 'width: 100%;';
        href_div.classList.add('ellipsis');
        href_div.style = 'width: 70%';

        let device_path = device.path //.replace('file://', '');

        let a = document.createElement('a');
        a.preventDefault = true;
        a.href = device_path; // device.path; //item.href;
        a.innerHTML = device.name;

        let umount_icon = utilities.add_icon('eject-fill');
        umount_div.title = 'Unmount Drive'
        umount_icon.style = 'position: absolute; right: -30px;';

        if (device.path === '') {

            // Mount
            umount_div.classList.add('inactive');
            umount_div.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                ipcRenderer.send('mount', device)
            })

            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                let root = device.root;
                ipcRenderer.send('mount', device)
            })

        } else {

            // Unmount
            umount_div.addEventListener('click', (e) => {
                e.stopPropagation();
                ipcRenderer.send('umount', device.path);
            })

            // Get view
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (e.ctrlKey) {
                    fileManager.get_files(device_path, 1);
                } else {
                    fileManager.get_files(device_path);
                }
                tabManager.addTabHistory(device_path);

                // handle highlight
                let items = this.sidebar.querySelectorAll('.item');
                items.forEach(item => {
                    item.classList.remove('sidebar_active');
                })
                item.classList.add('sidebar_active')

            })

        }

        let type = this.get_type(device.path);
        if (type === 'phone') {
            icon_div.append(utilities.add_icon('phone'), a);
        } else if (type === 'network') {
            icon_div.append(utilities.add_icon('hdd-network'), a);
        } else {
            icon_div.append(utilities.add_icon('hdd'), a);
        }

        item.addEventListener('mouseover', (e) => {
            item.title = device_path;
        })

        item.addEventListener('contextmenu', (e) => {
            utilities.clear();
            ipcRenderer.send('device_menu', device.path, device.uuid);
            item.classList.add('highlight_select');
        })

        href_div.append(a);
        umount_div.append(umount_icon);

        item.append(icon_div, href_div, umount_div);
        this.device_view.append(item);

        if (device.size_total) {

            let device_progress_container = utilities.add_div(['device_progress_container']);
            let device_progress = utilities.add_div(['device_progress']);

            let width = (parseInt(device.size_used) / parseInt(device.size_total)) * 100;
            device_progress.style = `width: ${width}%`;

            // console.log('device', device.name, device.size_total, device.size_used, width);

            device_progress_container.append(device_progress);
            this.device_view.append(device_progress_container);

            if (width > 70) {
                device_progress.classList.add('size_warming');
            }

            if (width > 90) {
                device_progress.classList.add('size_danger');
            }

            item.addEventListener('mouseover', (e) => {
                item.title = `${device_path}\n Total: ${utilities.get_file_size(device.size_total * 1024)}\n Used: ${utilities.get_file_size(device.size_used * 1024)}`;
            })

        }

    }

}

class WorkspaceManager {

    constructor() {

        this.is_moving = false;
        this.draggedRow = null;

        this.sidebar = document.querySelector('.sidebar');
        if (!this.sidebar) {
            return;
        }

        this.workspace_view = document.querySelector('.workspace_view');

        // Get Workspace
        ipcRenderer.on('get_workspace', (e) => {
            this.get_workspace(() => { });
        })

        // Remove Workspace
        ipcRenderer.on('remove_workspace', (e, href) => {
            ipcRenderer.send('remove_workspace', (e, href));
        })

        // Rename Workspace
        ipcRenderer.on('edit_workspace', (e, href) => {
            editWorkspace(href);
        })

        // get workspace folder icon
        ipcRenderer.on('set_workspace_folder_icon', (e, href, icon) => {
            let tr = document.querySelector(`.workspace_item[data-href="${href}"]`);
            let img = tr.querySelector('img');
            img.src = icon;
        })

        this.get_workspace(() => { });

    }

    // Get Workspace
    get_workspace(callback) {

        ipcRenderer.invoke('get_workspace').then(res => {

            let table = document.createElement('table');
            let tbody = document.createElement('tbody');
            table.classList.add('workspace_table');
            table.append(tbody);

            // add toggle for workspace items
            let workspace_accordion = utilities.add_div(['workspace_accordion']);
            let workspace_accordion_container = utilities.add_div(['workspace_accordion_container']);
            let workspace_accordion_toggle = utilities.add_link('#', '');

            workspace_accordion.append(workspace_accordion_toggle);
            workspace_accordion.append(workspace_accordion_container);

            let workspace_toggle_icon = utilities.add_icon('chevron-down');
            workspace_toggle_icon.classList.add('workspace_toggle');
            workspace_accordion_toggle.append(workspace_toggle_icon, 'Workspace');


            let workspace = document.getElementById('workspace');
            if (!workspace) {
                workspace = utilities.add_div();
                workspace.id = 'workspace'
                workspace.classList.add('workspace')
            }
            workspace.innerHTML = '';
            this.sidebar.append(workspace);
            workspace.append(document.createElement('hr'));

            if (res.length == 0) {
                workspace.append('Drop a file or folder');
            }

            workspace.addEventListener('mouseout', (e) => {
                workspace.classList.remove('active')
            })

            workspace_accordion_toggle.addEventListener('click', (e) => {

                workspace_accordion_container.classList.toggle('hidden');
                if (workspace_accordion_container.classList.contains('hidden')) {
                    workspace_toggle_icon.classList.add('bi-chevron-right');
                    workspace_toggle_icon.classList.remove('bi-chevron-down');
                } else {
                    workspace_toggle_icon.classList.remove('bi-chevron-right');
                    workspace_toggle_icon.classList.add('bi-chevron-down');
                }

            })

            res.forEach(file => {

                // console.log('file', file);

                let tr = document.createElement('tr');
                tr.classList.add('item', 'workspace_item');
                tr.dataset.href = file.href;

                let td1 = document.createElement('td');
                let td2 = document.createElement('td');

                let img = document.createElement('img');
                img.classList.add('icon');

                let a = document.createElement('a');
                a.href = file.href;

                let input = document.createElement('input');
                input.value = file.name;
                input.classList.add('input');

                a.innerHTML = file.name;
                a.preventDefault = true;

                let href_div = utilities.add_div(['href_div']);
                href_div.append(a);

                let input_div = utilities.add_div(['input_div', 'hidden']);
                input_div.append(input);

                td1.append(img);
                td2.append(href_div, input_div);
                tr.append(td1, td2);
                tbody.append(tr);

                if (file.content_type === 'inode/directory') {

                    tr.dataset.is_dir = true;
                    // img.src = 'icons/folder.svg';
                    tr.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.ctrlKey) {
                            tabManager.addTabHistory();
                            tabManager.add_tab(file.href);
                            fileManager.get_files(file.href);
                        } else {
                            fileManager.get_files(file.href);
                        }
                    });

                    ipcRenderer.send('get_workspace_folder_icon', file.href);

                } else {

                    // tr.dataset.is_dir = false;
                    ipcRenderer.invoke('get_icon', (file.href)).then(res => {
                        img.src = res;
                    });
                    tr.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        ipcRenderer.send('open', file.href);
                    });

                }

                // Reorder table rows using drag and drop
                tr.draggable = true;
                this.draggedRow = null; // Keep track of the dragged row

                tr.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    this.draggedRow = tr; // Set the currently dragged row
                    this.is_moving = true;
                    tr.classList.add('dragging');
                    console.log('dragstart', tr);
                });

                tr.addEventListener('dragover', (e) => {
                    e.preventDefault(); // Allow the drop event
                    e.stopPropagation();
                    tr.classList.add('drag_over'); // Highlight potential drop target
                });

                tr.addEventListener('dragleave', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    tr.classList.remove('drag_over'); // Remove highlight after leaving
                });

                // Show Workspace Context Menu
                tr.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    ipcRenderer.send('workspace_menu', file);
                    tr.classList.add('highlight_select');
                });

                tr.addEventListener('mouseover', (e) => {
                    a.focus();
                })

                // Edit workspace item
                tr.addEventListener('keyup', (e) => {

                    console.log(e.key);
                    e.preventDefault();
                    e.stopPropagation();

                    if (e.key === 'F2') {
                        input_div.classList.remove('hidden');
                        href_div.classList.add('hidden');
                        input.focus();
                        input.select();
                    }

                    if (e.key === 'Escape') {
                        // e.preventDefault();
                        // e.stopPropagation();
                        input_div.classList.add('hidden');
                        href_div.classList.remove('hidden');
                    }

                })

                input.addEventListener('click', (e) => {
                    e.stopPropagation();
                })

                input.addEventListener('keydown', (e) => {

                    if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        input_div.classList.add('hidden');
                        href_div.classList.remove('hidden');
                    }

                    if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        ipcRenderer.send('rename_workspace', file.href, input.value);
                        input_div.classList.add('hidden');
                        href_div.classList.remove('hidden');
                    }

                })

                workspace.append(workspace_accordion);
                this.workspace_view.append(workspace);

            })

            // add drop event listeners for tbody
            tbody.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (this.is_moving && this.draggedRow) {
                    // Get the element at the drop position
                    const x = e.clientX;
                    const y = e.clientY;
                    const targetElem = document.elementFromPoint(x, y);

                    if (targetElem && targetElem.closest('tr') && targetElem.closest('tbody')) {
                        const targetRow = targetElem.closest('tr');

                        if (targetRow !== this.draggedRow) {
                            // Insert the dragged row before the target row
                            targetRow.insertAdjacentElement('beforebegin', this.draggedRow);
                            console.log('Row moved:', this.draggedRow, 'before', targetRow);
                        }
                    }

                    // get all workspace items
                    let workspace_items = tbody.querySelectorAll('.workspace_item');
                    let workspace_arr = [];
                    workspace_items.forEach(item => {
                        workspace_arr.push(item.dataset.href);
                    })

                    ipcRenderer.send('reorder_workspace', workspace_arr);

                    // Clean up
                    this.is_moving = false;
                    this.draggedRow.classList.remove('dragging');
                    tbody.querySelectorAll('.drag_over').forEach((row) => row.classList.remove('drag_over'));
                    this.draggedRow = null;

                } else if (!this.is_moving) {

                    let selected_files_arr = utilities.get_selected_files();
                    ipcRenderer.send('add_workspace', selected_files_arr);

                    selected_files_arr = [];
                    utilities.clear();

                }

                console.log(this.is_moving, this.draggedRow)

            });

            // Ensure rows don't have leftover 'dragover' styles
            tbody.addEventListener('dragend', () => {
                tbody.querySelectorAll('.drag_over').forEach((row) => row.classList.remove('dragover'));
                if (this.draggedRow) this.draggedRow.classList.remove('dragging');
                this.is_moving = false;
                this.draggedRow = null;
            });

            workspace_accordion_container.append(table);

            return callback(workspace);

        })
    }


    // edit workspace
    editWorkspace() {

        let workspace = document.querySelector('.workspace');
        // console.log(workspace)
        if (workspace) {

            let workspace_item = workspace.querySelector('.workspace_item');
            let workspace_item_input = workspace.querySelector('.input');

            // Edit workspace item
            workspace.addEventListener('keyup', (e) => {

                e.preventDefault();
                e.stopPropagation();

                if (e.key === 'F2') {
                    workspace_item_input.classList.remove('hidden');
                    workspace_item.classList.add('hidden');
                    workspace_item_input.focus();
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    workspace_item_input.classList.add('hidden');
                    workspace_item.classList.remove('hidden');
                }

            })

            workspace_item_input.addEventListener('click', (e) => {
                e.stopPropagation();
            })

            workspace_item_input.addEventListener('change', (e) => {
                ipcRenderer.send('rename_workspace', file.href, e.target.value)
            })

        }

    }

}

class SideBarManager {

    constructor() {

        // this.utilities = Utilities;
        // this.fileManager = FileManager;

        this.sidebar = document.querySelector('.sidebar');
        if (!this.sidebar) {
            console.log('error getting sidebar');
            return;
        }

        // handle mousedown for sidebar
        this.sidebar.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        })

        this.main = document.querySelector('.main');
        if (!this.main) {
            console.log('error getting main');
            return;
        }

        // mouse down for main
        this.main.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        // handle mousedown for nav menu
        let nav_menu = document.querySelector('.navigation');
        nav_menu.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        })

        // Get references to the resize handle element
        this.drag_handle = document.querySelector(".sidebar_draghandle");

        // Get the initial mouse position
        this.initialMousePos;
        this.initialSidebarWidth = this.sidebar.offsetWidth;
        this.initialMainWidth = this.main.offsetWidth;

        this.distanceMoved = 0;
        this.newSidebarWidth = 0;
        this.newMainWidth = 0;

        this.is_resizing = false;
        // console.log('is_resizing', this.is_resizing)

        this.home_view = utilities.add_div(['home_view']);
        this.workspace_view = utilities.add_div(['workspace_view']);
        this.device_view = utilities.add_div(['device_view']);

        this.init_sidebar();

        this.sidebar.append(this.home_view, this.workspace_view, this.device_view);
        this.get_home();

    }

    // get home
    get_home() {

        // create array for bootstrap icons
        let icons = ['house', 'folder', 'file-earmark', 'image', 'music-note', 'camera-video', 'clock-history', 'hdd'];
        let home_dirs = ['Home', 'Documents', 'Downloads', 'Music', 'Pictures', 'Videos', 'Recent', 'File System'];
        home_dirs.forEach(dir => {

            let home_view_item = document.createElement('div');
            home_view_item.classList.add('home', 'item');

            let icon_arr_item = icons[home_dirs.indexOf(dir)];
            let icon_div = document.createElement('div');
            icon_div.classList.add('icon');

            let icon_i = document.createElement('i');
            icon_i.classList.add('bi', `bi-${icon_arr_item}`);

            icon_div.appendChild(icon_i);

            let link_div = document.createElement('div');
            link_div.innerHTML = dir;

            home_view_item.append(icon_div, link_div);
            this.home_view.append(home_view_item);

            home_view_item.addEventListener('click', (e) => {
                let home_dir = `${utilities.home_dir}`;
                switch (dir) {
                    case 'Home':
                        if (e.ctrlKey) {
                            tabManager.add_tab(home_dir);
                            fileManager.get_files(`${home_dir}`);
                        } else {
                            fileManager.get_files(`${home_dir}`);
                        }
                        break;
                    case 'Recent':
                        if (e.ctrlKey) {
                            tabManager.add_tab(home_dir);
                            ipcRenderer.send('get_recent_files');
                        } else {
                            ipcRenderer.send('get_recent_files');
                        }
                        break;
                    case 'File System':
                        if (e.ctrlKey) {
                            tabManager.add_tab('/');
                            fileManager.get_files(`/`);
                        } else {
                            fileManager.get_files(`/`);
                        }
                        break;
                    default:
                        if (e.ctrlKey) {
                            tabManager.add_tab(home_dir);
                            fileManager.get_files(`${home_dir}/${dir}`);
                        } else {
                            fileManager.get_files(`${home_dir}/${dir}`);
                        }
                        break;
                }

            });

            home_view_item.addEventListener('contextmenu', (e) => {
                ipcRenderer.send('home_menu', dir);
                home_view_item.classList.add('highlight_select');
            });


        });

    }

    // init sidebar
    init_sidebar() {

        // Get references to the resize handle element
        this.drag_handle = document.querySelector(".sidebar_draghandle");

        // Add event listener to the resize handle
        document.addEventListener('mousedown', this.start_resize);
        document.addEventListener('mousemove', this.resize);
        document.addEventListener('mouseup', this.stop_resize);

        // resize sidebar width
        let window_settings = ipcRenderer.sendSync('get_window_settings');
        if (window_settings.sidebar_width) {
            // console.log('sidebar width', window_settings.sidebar_width);
            this.sidebar.style.width = `${window_settings.sidebar_width}px`;
            this.main.style.width = `${window_settings.main_width}px`;
        }

    }

    // handle sidebar resize
    start_resize(e) {

        this.is_resizing = true;

        this.sidebar = document.querySelector('.sidebar');
        this.main = document.querySelector('.main');

        // Get the initial widths of sidebar and main divs
        this.initialSidebarWidth = this.sidebar.offsetWidth;
        this.initialMainWidth = this.main.offsetWidth;

        // Get the initial mouse position
        this.initialMousePos = e.clientX;
        this.main.classList.add('margin_left');

        // console.log('start resizing', this.is_resizing, this.initialSidebarWidth, this.initialMainWidth);

    }

    // resize sidebar
    resize(e) {

        // console.log('test', this.is_resizing);

        if (!this.is_resizing) return;

        // Calculate the distance the mouse has been moved
        this.distanceMoved = e.clientX - this.initialMousePos;

        // Update the sidebar width
        this.newSidebarWidth = this.initialSidebarWidth + this.distanceMoved;
        this.newMainWidth = this.initialMainWidth - this.distanceMoved;

        // Update the sidebar width
        this.sidebar.style.width = `${this.newSidebarWidth}px`;

        // Update the main width
        if (this.newSidebarWidth < 500) {
            this.main.style.width = `${this.newMainWidth}px`;
        }

        // console.log('resizing', this.distanceMoved, this.newSidebarWidth, this.newMainWidth);

    }

    // stop the resizing
    stop_resize(e) {

        if (!this.is_resizing) return;

        this.is_resizing = false;

        let window_settings = ipcRenderer.sendSync('get_window_settings');
        window_settings.sidebar_width = this.newSidebarWidth;
        window_settings.main_width = this.newMainWidth;
        ipcRenderer.send('update_window_settings', window_settings);

        console.log('window settings', window_settings);


    }

}

class KeyBoardManager {

    constructor() {

        // add event listener for keydown
        document.addEventListener('keydown', (e) => {

            // e.preventDefault();
            // e.stopPropagation();

            // prevent inputs from firing global keyboard events
            if (e.target.isContentEditable || e.target.tagName === 'INPUT') {
                // return;
            }

            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                utilities.set_msg('ctrl + key');

            }

            // ctrl + r to refresh
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                e.stopPropagation();
               ipcRenderer.send('reload');
            }

            // ctrl + l to focus location
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                e.stopPropagation();
                utilities.show_location_input();
            }

            // esc to deselect all
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                utilities.clear();
            }

            // ctrl + a to select all
            if (e.ctrlKey && e.key === 'a') {
                e.preventDefault();
                e.stopPropagation();
                utilities.select_all();
            }

            // ctrl + c to copy
            if (e.ctrlKey && e.key === 'c') {
                utilities.copy();
            }

            // ctrl + v to paste
            if (e.ctrlKey && e.key === 'v') {
                utilities.paste();
            }

            // ctrl + x to cut
            if (e.ctrlKey && e.key === 'x') {
                e.preventDefault();
                e.stopPropagation();
                utilities.cut();
            }

            // ctrl + shift + n to create a new folder
            if (e.ctrlKey && e.shiftKey && e.key.toLocaleLowerCase() === 'n') {
                e.preventDefault();
                e.stopPropagation();
                utilities.mkdir();
            }

            // ctrl + shift + e to extract
            if (e.ctrlKey && e.shiftKey && e.key.toLocaleLowerCase() === 'e') {
                e.preventDefault();
                e.stopPropagation();
                utilities.extract();
            }

            // ctrl + shift + c to compress
            if (e.ctrlKey && e.shiftKey && e.key.toLocaleLowerCase() === 'c') {
                e.preventDefault();
                e.stopPropagation();
                utilities.compress('zip');
            }

            // del to delete
            if (e.key === 'Delete' && !e.target.isContentEditable && !e.target.tagName === 'INPUT') {
                e.preventDefault();
                e.stopPropagation();
                utilities.delete();
            }

            // f2 to rename
            if (e.key === 'F2') {
                e.preventDefault();
                e.stopPropagation();
                utilities.edit();
            }

            // f5 to refresh
            if (e.key === 'F5') {
                e.preventDefault();
                e.stopPropagation();
                fileManager.get_files(utilities.get_location());
            }

        })

        // add event listener for keyup
        document.addEventListener('keyup', (e) => {

            // e.preventDefault();
            // e.stopPropagation();

            // prevent inputs from firing global keyboard events
            // if (e.ctrlKey) {
                // utilities.set_msg('');
            // }


        })

    }



}

class IconManager {

    constructor() {

        this.readonly_icon = '';
        this.settings = settingsManager.get_settings();
        this.icon_size = this.settings.icon_size;


        // listen for set_folder_icon event
        ipcRenderer.on('set_folder_icon', (e, href, icon) => {
            this.set_folder_icon(href, icon);
        });

        // listen for set_icon event
        ipcRenderer.on('set_icon', (e, href, icon) => {
            this.set_icon(href, icon);
        });

        // resize icons on wheel event
        document.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                if (e.deltaY < 0) {

                    // increase current icon size by n pixels
                    if (this.icon_size >= 128) {
                        return;
                    }

                    this.icon_size += 16;
                    this.resize_icons(this.icon_size);

                } else {

                    // decrease current icon size by n pixels
                    if (this.icon_size <= 16) {
                        return;
                    }

                    this.icon_size -= 16;
                    this.resize_icons(this.icon_size);
                }
            }
        });

    }

    // get icons
    get_icons() {

        console.log('running get icons');

        let items = document.querySelectorAll('tr');
        items.forEach(item => {
            // console.log('get icon', item.dataset.is_dir, item.dataset.href);
            if (item.dataset.is_dir === 'true') {
                ipcRenderer.send('get_folder_icon', item.dataset.href);
            } else {
                try {
                    ipcRenderer.invoke('get_icon', item.dataset.href).then(icon => {
                        this.set_icon(item.dataset.id, icon);
                    });
                } catch (err) {

                }
            }
        });

        utilities.lazy_load_icons(document.querySelector('.table'));

    }

    // get readonly_icon
    get_readonly_icon() {
        return this.readonly_icon;
    }

    // set icon
    set_icon(id, icon) {
        let item = document.querySelector(`[data-id="${id}"]`);
        if (item) {
            let icon_div = item.querySelector('.icon');
            let img = icon_div.querySelector('img');
            img.dataset.src = icon;
        }
    }

    // set folder icon
    set_folder_icon(href, icon) {

        try {

            let active_tab_content = tabManager.get_active_tab_content();
            let icon_div = active_tab_content.querySelector(`[data-href="${href}"]`);
            if (!icon_div) {
                console.log('Error: Setting folder icon div');
                return;
            }
            let img = icon_div.querySelector('img');
            if (img) {

                img.src = icon;
                img.style.width = `${this.icon_size}px`;
                img.style.height = `${this.icon_size}px`;

            }



        } catch (err) {
            utilities.set_msg('Error setting folder icon', err);
        }

    }

    // resize icons
    resize_icons(size) {

        let items = document.querySelectorAll('.img');
        items.forEach(item => {
            item.style.width = `${size}px`;
            item.style.height = `${size}px`;
        })

        this.settings.icon_size = size;
        settingsManager.update_settings(this.settings);

    }

}

class TabManager {

    constructor() {

        this.tab_data = {
            tab_id: 1,
            files_arr: []
        }
        this.tab_data_arr = [];

        this.tabs = [];
        this.tab_history_arr = [];
        this.tab_history_idx_arr = [];

        this.active_tab_content = document.querySelector('.active-tab-content');

        this.tab_id = 0;

        this.location_input = document.querySelector('.location');
        if (!this.location_input) {
            return;
        }

        this.main = document.querySelector('.main')
        this.tabHeader = document.querySelector('.tab-header');
        this.tabHeader.classList.add('flex')
        this.main.append(this.tabHeader);

        this.back_btn = document.querySelector('.back');
        this.forward_btn = document.querySelector('.forward');

        this.back_btn.style = 'pointer-events: none';

        this.tab_history_idx = 0;
        this.back_btn.addEventListener('click', (e) => {
            this.tabHistoryBack();
        })

        this.forward_btn.addEventListener('click', (e) => {
            this.tabHistoryForward();
        })

        // Context menu
        this.back_btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.getTabHistory(this.tab_id, 0);
        })

        this.forward_btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.getTabHistory(this.tab_id, 1);
        })

    }

    // set tab data array
    set_tab_data_arr(files_arr) {

        // check if tab data exists
        let tab_data = this.tab_data_arr.find(tab_data => tab_data.tab_id === this.tab_id);
        if (tab_data) {
            tab_data.files_arr = files_arr;
        } else {
            this.tab_data = {
                tab_id: this.tab_id,
                files_arr: files_arr
            }
            this.tab_data_arr.push(this.tab_data);
        }


        // console.log('tab data arr', this.tab_data_arr);

    }

    // remove tab data
    remove_tab_data(tab_id) {
        let id = parseInt(tab_id);
        let tab_data = this.tab_data_arr.find(tab_data => tab_data.tab_id === id);
        if (tab_data) {

            let idx = this.tab_data_arr.indexOf(tab_data);
            this.tab_data_arr.splice(idx, 1);
        }
        console.log('removing tab data', this.tab_data_arr, id);
    }

    // get active_tab_content div
    get_active_tab_content() {
        return this.active_tab_content;
    }

    // clear highlight tabs
    clear_highlight() {
        let tabs = document.querySelectorAll('.tab');
        if (tabs.length > 0) {
            tabs.forEach(tab => {
                tab.classList.remove('highlight');
            })
        }
    }

    add_tab(location) {

        ++this.tab_id;

        // validate location
        // regex to validate location
        let regex = /^(\/[a-zA-Z0-9_]+)+$/;
        if (location == regex.test(location) || location === undefined || location === null || location === '') {
            utilities.set_msg('Error adding tab. Invalid location');
            return;
        }

        let label = utilities.get_base_name(location);

        // struct for tracking tab history idx
        this.tab_idx_obj = {
            tab_id: this.tab_id,
            tab_idx: 0
        }
        this.tab_history_idx_arr.push(this.tab_idx_obj);

        // let location = document.querySelector('.location');
        let tab = utilities.add_div(['tab', 'flex']);
        let tab_content = utilities.add_div(['tab-content']);
        let col1 = utilities.add_div(['label']);
        let col2 = utilities.add_div(['tab_close']);
        let btn_close = document.createElement('i');

        // set active tab content
        this.active_tab_content = tab_content;

        tab.title = location;
        tab.dataset.id = this.tab_id;
        tab.dataset.href = location;
        tab_content.dataset.id = this.tab_id;

        tab.draggable = true;

        col1.innerHTML = label;
        btn_close.classList.add('bi', 'bi-x');

        col2.append(btn_close);
        tab.append(col1, col2);

        this.tabHeader.append(tab);

        this.tabs.push(this.tab_id);
        this.main.append(tab_content)

        this.clearActiveTabs();
        tab.classList.add('active-tab');
        tab_content.classList.add('active-tab-content');
        tab_content.classList.remove('hidden');

        // Close Tab
        btn_close.addEventListener('click', (e) => {
            e.stopPropagation();
            let current_tabs = document.querySelectorAll('.tab');
            let current_tab_content = document.querySelectorAll('.tab-content');
            let active_tab = document.querySelector('.active-tab');
            if (active_tab === tab) {

                if (current_tabs.length > 0) {

                    let tabs = document.querySelectorAll('.tab')
                    let idx = Array.from(tabs).indexOf(tab) - 1

                    if (idx >= 0) {

                        this.remove_tab_data(tab.dataset.id);

                        tab.remove();
                        tab_content.remove();

                        current_tabs[idx].classList.add('active-tab');
                        current_tab_content[idx].classList.add('active-tab-content');
                        current_tab_content[idx].classList.remove('hidden');
                        this.tab_id = idx + 1;

                        // update active tab content
                        this.active_tab_content = current_tab_content[idx];

                        // update global location
                        utilities.set_location(current_tabs[idx].dataset.href);

                    }

                }

            } else {
                if (current_tabs.length > 0) {

                    this.remove_tab_data(tab.dataset.id);

                    tab.remove();
                    tab_content.remove();

                }
            }

        })

        // Switch Tabs
        tab.addEventListener('click', (e) => {

            this.clearActiveTabs();

            tab.classList.add('active-tab');
            tab_content.classList.add('active-tab-content');
            tab_content.classList.remove('hidden');

            // set active tab content
            this.active_tab_content = tab_content;

            this.tab_id = parseInt(tab.dataset.id);
            this.tab_history_idx = 0;

            // update global location
            utilities.set_location(tab.dataset.href);

            // update global destination for paste / move operation
            utilities.set_destination(tab.dataset.href);

            // set local destination
            this.destination = tab.dataset.href;

            // update disk space
            utilities.get_disk_space(tab.dataset.href);

            // navigation.getCardCount(); // get new card count for navigation
            // navigation.getCardGroups();

        })

        let tabs = document.querySelectorAll('.tab');

        // Handle Tab Dragging ////////////////////////////
        const selectionRectangle = document.querySelector('.selection-rectangle');
        let draggingTab = null;
        tabs.forEach(tab => {

            // Drag Start
            tab.addEventListener("dragstart", (e) => {
                e.stopPropagation();
                utilities.is_dragging = true;
                if (e.target.classList.contains("tab")) {
                    draggingTab = e.target;
                    e.target.style.opacity = 0.5;
                }
            });

            // Drag End
            tab.addEventListener("dragend", (e) => {
                if (draggingTab) {
                    draggingTab.style.opacity = 1;
                    draggingTab = null;
                }
            });

            tab.addEventListener("dragover", (e) => {
                e.preventDefault();
                tab.classList.add('highlight');
            });

            tab.addEventListener('dragleave', (e) => {
                if (e.target.classList.contains('highlight')) {
                    e.target.classList.remove('highlight');
                }
            })

            tab.addEventListener("drop", (e) => {
                e.preventDefault();
                e.stopPropagation();
                selectionRectangle.style.display = 'none';
                this.clear_highlight();
                if (draggingTab) {
                    const targetTab = e.target.closest(".tab");
                    if (targetTab) {
                        const container = document.querySelector(".tab-header");
                        const targetIndex = Array.from(container.children).indexOf(targetTab);
                        const draggingIndex = Array.from(container.children).indexOf(draggingTab);

                        if (draggingIndex !== targetIndex) {
                            container.insertBefore(draggingTab, targetTab);
                        }
                    }
                }

            });

        })

        // drop for active tab content
        tab_content.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // tab_content.classList.add('highlight');
        });

        tab_content.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // tab_content.classList.remove('highlight');
        })

        tab_content.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.ctrlKey) {
                alert('2680 fix me - tab_content.addEventListener drop');
                console.log('2680 fix me - tab_content.addEventListener drop');
                // utilities.copy();
                // console.log('dropping on tab content', e);
            }
        })

        // navigation.getCardCount(); // get new card count for navigation
        // navigation.getCardGroups();

        if (label !== 'Home' && label !== 'Settings' && label !== 'Recent' && label !== 'Search Results') {
            this.addTabHistory(this.location_input.value);
        }

    }

    // update tab
    update_tab(location) {

        let tab = document.querySelector('.active-tab');
        tab.title = location;
        tab.dataset.href = location
        let label = utilities.get_base_name(location);
        let col1 = tab.querySelector('.label');
        col1.innerHTML = label;

    }

    // Clear Active Tab
    clearActiveTabs() {
        let tabs = this.tabHeader.querySelectorAll('.tab');
        let tab_content = document.querySelectorAll('.tab-content');
        tabs.forEach((tab, i) => {
            tab.classList.remove('active-tab')
            tab_content[i].classList.remove('active-tab-content')
            tab_content[i].classList.add('hidden');
        })
    }

    // add tab history
    addTabHistory(href) {

        if (href === undefined || href === null) {
            return;
        }

        let history_obj = {
            tab_id: this.tab_id,
            location: href
        }

        // reset tab history idx when the history changes
        this.tab_history_idx = 0;

        let tab = document.querySelector('.active-tab');
        this.tab_id = parseInt(tab.dataset.id);

        if (this.tab_id > 0) {
            this.tab_history_arr.unshift(history_obj);
        }

        // check for history
        let tab_arr = this.tab_history_arr.filter(item => item.tab_id === parseInt(this.tab_id));
        if (tab_arr.length > 0) {
            this.back_btn.style = 'pointer-events: auto';
        }

    }

    // get tab history
    getTabHistory(tab_id, direction = 0) {

        // ipcRenderer.invoke('get_tab_history').then(history => {

        // this.tab_history_arr = history;
        let tab_history = this.tab_history_arr.filter(item => item.tab_id === parseInt(tab_id));

        if (tab_history.length === 0) {
            return;
        }

        if (direction === 1) {
            tab_history.reverse();
        }

        // Create the popup element
        const popup = document.createElement('div');
        popup.classList.add('history-popup'); // Add a CSS class for styling

        // Create the title
        const title = document.createElement('h2');
        title.textContent = 'Navigation History';

        // Create the list of history items
        tab_history.forEach((item, idx) => {

            // if (idx > 0) {

            const menu_item = utilities.add_div(['item']);
            menu_item.textContent = item.location;
            popup.append(menu_item);

            menu_item.addEventListener('click', (e) => {
                fileManager.get_files(item.location);
                // this.history_idx = this.historyArr.length - 1;
                utilities.clear_highlight();
            })

            // }

        });

        popup.addEventListener('mouseleave', (e) => {
            popup.remove();
        })

        // Determine position based on space below and above
        const windowHeight = window.innerHeight;
        const popupHeight = popup.offsetHeight;
        const triggerElement = this.back_btn // Replace with your trigger element
        const triggerRect = triggerElement.getBoundingClientRect();
        const triggerTop = triggerRect.top;
        const spaceBelow = windowHeight - (triggerTop + triggerRect.height);
        const spaceAbove = triggerTop;

        if (spaceBelow > popupHeight) {
            popup.style.top = triggerTop + triggerRect.height + 10 + 'px';
        } else if (spaceAbove > popupHeight) {
            popup.style.top = triggerTop - popupHeight + 'px';
        } else {
            // Handle cases where neither direction has enough space
            // console.warn('Not enough space to display popup!');
        }
        popup.style.left = triggerRect.left + 10 + 'px';

        // Append the popup to the body
        const nav_menu = document.querySelector('.navigation');
        nav_menu.appendChild(popup);

        // console.log(this.historyArr)
        return tab_history;

        // })

    }

    // get history idx by tab
    getTabHistoryIdx(tab_id) {
        let tab_history_idx = 0;
        this.tab_history_idx_arr.forEach(item => {
            if (item.tab_id === tab_id) {
                tab_history_idx = item.tab_idx;
                return;
            }
        })
        return tab_history_idx;
    }

    // set history idx by tab
    setTabHistoryIdx(tab_id, idx) {

        this.tab_history_idx_arr.forEach(item => {
            if (item.tab_id === tab_id) {
                item.tab_idx = idx;
                return;
            }
        })

    }

    // tab history back
    tabHistoryBack() {

        console.log('tab history back', this.tab_id);

        // get tab history idx from array
        this.tab_history_idx = this.getTabHistoryIdx(this.tab_id);

        let filter_arr = this.tab_history_arr.filter(item => item.tab_id === parseInt(this.tab_id));
        if (this.tab_history_idx > filter_arr.length - 2) {
            this.tab_history_idx = 0;
            // return;
        }
        this.tab_history_idx += 1;

        if (filter_arr.length > 1) {

            let href = filter_arr[this.tab_history_idx].location;

            if (href !== undefined || href !== null) {

                this.location_input.value = href;
                fileManager.get_files(href);

                // update tab history idx
                this.setTabHistoryIdx(this.tab_id, this.tab_history_idx);
                console.log('tab_history_idx', this.tab_history_idx, 'history_arr', filter_arr.length)

            }

        }

    }

    // tab history forward
    tabHistoryForward() {

        this.tab_history_idx = this.getTabHistoryIdx(this.tab_id);

        if (this.tab_history_idx === 0) {
            this.tab_history_arr.push(this.location_input.value);
        }

        let filter_arr = this.tab_history_arr.filter(item => item.tab_id === parseInt(this.tab_id));
        filter_arr.reverse();
        if (this.tab_history_idx > filter_arr.length - 2) {
            this.tab_history_idx = 0;
            // return;
        }
        this.tab_history_idx += 1;

        let href = filter_arr[this.tab_history_idx].location;
        this.location_input.value = href;
        fileManager.get_files(href);

        // update tab history idx
        this.setTabHistoryIdx(this.tab_id, this.tab_history_idx);

    }

}

class FileManager {

    constructor(tabManager, iconManager) {

        // this.events = [];
        this.tabManager = tabManager;
        this.iconManager = iconManager;

        this.loaded_rows = 0;
        this.chunk_size = 1000;
        this.view = '';
        this.selected_files = [];
        this.files_arr = [];
        this.location = '';

        this.tab_data_arr = [];
        this.drag_handle = null;

        this.ctrlKey = false;

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Control')  this.ctrKey = true;
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Control')  this.ctrKey = false;
        });

        this.main = document.querySelector('.main');
        if (!this.main) {
            console.log('error getting main');
            return;
        }

        // get view settings
        this.view = settingsManager.get_view();

        if (settingsManager.get_location() === '') {
            this.location = utilities.home_dir;
        } else {
            this.location = settingsManager.get_location();
        }
        this.get_files(this.location);

        this.filter = document.querySelector('.filter');
        this.specialKeys = [
            'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Shift', 'Backspace',
            'Tab', 'PageUp', 'PageDown', 'Home', 'End', 'Control', 'Alt', 'Meta', 'Escape',
            'CapsLock', 'Insert', 'Delete', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8',
            'F9', 'F10', 'F11', 'F12', 'ScrollLock', 'Pause', 'ContextMenu', 'PrintScreen',
            'NumLock'
        ];
        this.init_filter();

        // resize column
        this.list_view_settings = settingsManager.get_list_view_settings();
        this.settings = settingsManager.get_settings();

        // get sort settings
        this.sort_by = this.settings.sort_by;
        this.sort_direction = this.settings.sort_direction;

        if (this.sort_by === undefined || this.sort_by === null || this.sort_by === '') {
            this.sort_by = 'mtime';
        }

        if (this.sort_direction === undefined || this.sort_direction === null || this.sort_direction === '') {
            this.sort_direction = 'desc';
        }

        this.initialX = 0;
        this.initialWidth = 0;
        this.sidebar_width = 0;
        this.nextColumn = null;

        this.currentColumn = null;
        this.dragHandle = null;
        this.startX = 0;
        this.startWidth = 0;
        this.minWidth = 50; // Minimum column width
        this.maxWidth = 1000; // Maximum column width

        this.is_resizing = false;

        // this.sort_by_column = this.sort_by_column.bind(this);

        // this.init_col_resize = this.init_col_resize.bind(this);
        this.resize_col = this.resize_col.bind(this);
        this.stop_col_resize = this.stop_col_resize.bind(this);
        //

        // sort menu
        ipcRenderer.on('sort_by', (e, sort, sort_direction) => {

            if (sort === null || sort === undefined || sort === '') {
                utilities.set_msg(`Error: Sort is null or undefined ${sort}`);
                return;
            }
            if (sort_direction === null || sort_direction === undefined || sort_direction === '') {
                utilities.set_msg(`Error: Sort direction is null or undefined ${sort_direction}`);
                return;
            }
            if (this.location === null || this.location === undefined || this.location === '') {
                utilities.set_msg(`Error: Location is null or undefined ${this.location}`);
                return;
            }

            this.sort_by = sort;
            this.sort_direction = sort_direction;

            this.get_files(this.location);

            // save sort direction
            this.settings.sort_by = this.sort_by;
            this.settings.sort_direction = this.sort_direction;
            settingsManager.update_settings(this.settings);

        });

        // switch view
        ipcRenderer.on('switch_view', (e, view) => {

            if (view === null || view === undefined || view === '') {
                utilities.set_msg(`Error: View is null or undefined ${view}`);
                return;
            }

            this.location = settingsManager.get_location();
            if (this.location === null || this.location === undefined || this.location === '') {
                this.location = utilities.home_dir;
            }

            this.view = view;

            switch (this.view) {
                case 'list_view':
                    this.get_files(this.location);
                    break;
                case 'grid_view':
                    this.get_files(this.location);
                    break;
                default:
                    console.error(`Unknown view: ${this.view}`);
                    break;
            }

            this.settings.view = this.view;
            this.settings.location = this.location;
            ipcRenderer.send('update_settings', this.settings);

        });

        // get files
        ipcRenderer.on('ls', (e, files_arr) => {

            this.files_arr = files_arr;
            if (this.view === '' || this.view === undefined) {
                console.log('view is undefined');
            }

            if (this.view === 'list_view') {
                this.get_list_view(files_arr);
            } else if (this.view === 'grid_view') {
                this.get_grid_view(files_arr);
            }

            tabManager.set_tab_data_arr(files_arr);
            tabManager.update_tab(this.location);
            ipcRenderer.send('get_disk_space', this.location);

            this.check_for_empty_folder();

        });

        // add items
        ipcRenderer.on('add_items', (e, copy_arr) => {

            console.log('add items', copy_arr);

            this.add_items(copy_arr);
            this.check_for_empty_folder();

        });

        // get list view item
        ipcRenderer.on('get_item', (e, f) => {

            console.log('get item', f);

            let active_tab_content = tabManager.get_active_tab_content();
            if (!active_tab_content) {
                console.log('error getting active tab content');
                return;
            }

            if (this.view === 'grid_view') {

                console.log('grid view');
                let grid = active_tab_content.querySelector('.grid3');
                if (!grid) {
                    console.log('Error: getting grid');
                    utilities.set_msg('Error: getting grid');
                    return;
                }

                let items = grid.querySelectorAll('.card');
                if (items.length > 0) {

                    let idx = Array.from(items).filter(item => item.dataset.is_dir === 'true').length;
                    let card = this.get_grid_view_item(f);

                    if (!card) {
                        console.log('error getting card');
                        utilities.set_msg('Error: getting card');
                        return;
                    }

                    if (f.is_dir) {
                        grid.prepend(card);
                    } else {
                        // insert row at position idx
                        grid.insertBefore(card, grid.children[idx]);
                    }

                }

            } else if (this.view === 'list_view') {

                let table = active_tab_content.querySelector('.table');
                if (!table) {
                    console.log('error getting table');
                    return;
                }
                let tbody = table.querySelector('tbody');
                let items = active_tab_content.querySelectorAll('.tr')

                // convert items to array and get number of directories
                let idx = Array.from(items).filter(item => item.dataset.is_dir === 'true').length;
                let tr = this.get_list_view_item(f);

                if (f.is_dir) {
                    tbody.prepend(tr);
                } else {
                    // insert row at position idx
                    tbody.insertBefore(tr, tbody.children[idx]);
                }

                // focus item
                tr.classList.add('highlight_select');
                console.log(f)
                let href = tr.querySelector('a');
                href.focus();

                // tr.dataset.id = utilities.stob(href.innerText);

            }

            this.check_for_empty_folder();

        });

        // edit item mode
        ipcRenderer.on('edit_item', (e, f) => {

            if (f.id === undefined || f.id === null) {
                utilities.set_msg('Error: getting file id');
                return;
            }

            let active_tab_content = tabManager.get_active_tab_content(); //document.querySelector('.active-tab-content');
            let item = active_tab_content.querySelector(`[data-id="${f.id}"]`);
            if (!item) {
                console.log('error getting data-id', f.id);
                utilities.set_msg(`Error: getting  data-id ${f.id}`);
                return;
            }

            let edit_name = item.querySelector('.href');
            if (edit_name) {
                edit_name.classList.add('hidden');
            } else {
                console.log('error getting edit name');
                utilities.set_msg('Error: getting edit name');
                return;
            }

            let input = item.querySelector('input');
            if (input) {
                input.classList.remove('hidden');
            } else {
                console.log('error getting input');
                utilities.set_msg('Error: getting input');
                return;
            }

            input.focus();
            input.setSelectionRange(0, input.value.lastIndexOf('.'));

            this.check_for_empty_folder();

        });

        // handle updating item on rename
        ipcRenderer.on('update_item', (e, f) => {

            console.log('update item', f);

            let active_tab_content = tabManager.get_active_tab_content(); //document.querySelector('.active-tab-content');
            let item = active_tab_content.querySelector(`[data-id="${f.id}"]`);

            if (item) {

                if (this.view === 'grid_view') {

                    let card = this.get_grid_view_item(f);
                    if (!card) {
                        console.log('error getting card');
                        utilities.set_msg('Error: getting card');
                        return;
                    }
                    item.replaceWith(card);

                } else if (this.view === 'list_view') {

                    let href = item.querySelector('.href');
                    if (!href) {
                        console.log('error getting href');
                        utilities.set_msg('Error: getting href');
                        return;
                    }

                    href.innerText = this.sanitize_file_name(f.name);
                    let tr = fileManager.get_list_view_item(f);
                    item.replaceWith(tr);

                }


            } else {
                console.log('error getting data-id', f.id);
                utilities.set_msg(`Error: getting data-id ${f.id}`);
            }


        });

        // remove item
        ipcRenderer.on('remove_item', (e, id) => {
            let active_tab_content = tabManager.get_active_tab_content(); //document.querySelector('.active-tab-content');
            let item = active_tab_content.querySelector(`[data-href="${id}"]`);
            if (item) {
                item.remove();
            } else {
                console.log('error removing item', id);
            }

        });

        // remove items
        ipcRenderer.on('remove_items', (e, files_arr) => {
            const active_tab_content = tabManager.get_active_tab_content(); //document.querySelector('.active-tab-content');
            files_arr.forEach(f => {
                let item = active_tab_content.querySelector(`[data-id="${f.id}"]`);
                item.remove();
            })
            this.check_for_empty_folder();
            utilities.get_disk_space(this.location);
        });

        ipcRenderer.on('overwrite', (e, overwrite_arr) => {
            // this.overwrite(overwrite_arr);
        });

        ipcRenderer.on('recent_files', (e, files_arr) => {
            if (this.view == 'grid_view') {
                tabManager.add_tab('Recent');
                this.get_grid_view(files_arr);
            } else if (this.view == 'list_view') {
                this.get_list_view(files_arr);
            }
        })

    }

    // set / remove empty folder message
    check_for_empty_folder() {

        let active_tab_content = tabManager.get_active_tab_content(); //document.querySelector('.active-tab-content');
        let items = active_tab_content.querySelectorAll('.card, .tr');

        console.log('check for empty folder', items.length);

        if (items.length === 0) {
            this.folder_is_empty();
        } else {
            let empty_msg = active_tab_content.querySelector('.empty_msg');
            if (empty_msg) {
                empty_msg.remove();
            }
        }

    }

    // Folder is Empty
    folder_is_empty() {

        let active_tab_content = tabManager.get_active_tab_content(); //document.querySelector('.active-tab-content');

        let div = document.createElement('div');
        div.classList.add('empty_msg');

        let i = document.createElement('i');
        i.classList.add('bi', 'bi-folder-x');

        let msg = document.createElement('div');
        msg.classList.add('msg');
        msg.innerHTML = 'Folder is Empty';

        div.append(i, msg);
        active_tab_content.append(div);

        utilities.set_msg('Folder is Empty');

    }

    // init column resize
    init_col_resize(e) {

        this.is_resizing = true;

        this.currentColumn = e.target.parentElement;
        this.startX = e.clientX;
        this.startWidth = this.currentColumn.offsetWidth;

        document.addEventListener('mousemove', this.resize_col);
        document.addEventListener('mouseup', this.stop_col_resize);

    }

    // resize column
    resize_col(e) {

        if (!this.is_resizing) return;

        // change cursor
        document.body.style.cursor = 'col-resize';


        requestAnimationFrame(() => {
            const dx = e.clientX - this.startX;
            let width = this.startWidth + dx;
            // let width = this.startWidth + (e.clientX - this.startX);
            width = Math.max(this.minWidth, Math.min(width, this.maxWidth)); // Constrain width
            this.currentColumn.style.width = `${width}px`;

        });

        // // disable drag select
        dragSelect.set_is_dragging(true);


    }

    // stop column resize
    stop_col_resize(e) {

        document.body.style.cursor = 'default';

        document.removeEventListener('mousemove', this.resize_col);
        document.removeEventListener('mouseup', this.stop_col_resize);

        // update column size in settings
        this.list_view_settings.col_width[this.currentColumn.dataset.col_name] = this.currentColumn.offsetWidth;
        ipcRenderer.send('update_list_view_settings', this.list_view_settings);

        const drag_handle = this.currentColumn.querySelector('.drag_handle');
        drag_handle.style.width = '10px';
        drag_handle.style.right = '-5px';

        setTimeout(() => {
            this.is_resizing = false;
        }, 500);

    }

    // init filter
    init_filter() {

        if (!this.filter) {
            return;
        }

        // if filter active then handle ctrl+v
        this.filter.addEventListener('paste', (e) => {
            this.run_filer();
        })

        this.filter.addEventListener('focus', (e) => {
            this.filter.classList.add('active');
        })

        this.filter.addEventListener('blur', (e) => {
            if (this.filter.innerText === '') {
                this.filter.classList.remove('active');
            }
        })

        this.filter.addEventListener('input', (e) => {
            this.run_filer();
        });

        document.addEventListener('keydown', (e) => {

            if (document.activeElement.tagName.toLowerCase() === 'input') {
                return;
            }

            if (e.ctrlKey && e.key === 'l') {
                // this.location.focus();
                return;
            }

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.clear_filter();
            }

            if (this.specialKeys.includes(e.key)) {
                return;
            }

            if (e.key.match(/[a-z0-9-_.]/i) && (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey)) {
                return;
            }

            if (!this.specialKeys.includes(e.key) && document.activeElement !== this.filter) {
                if (e.key.match(/[a-z0-9-_.]/i)) {
                    this.filter.focus();
                    this.filter.classList.remove('empty');
                    this.quick_search_sting += e.key;
                    this.run_filer();
                }
            }

        });

    }

    // run filter
    run_filer() {

        setTimeout(() => {

            this.filter.focus();
            this.quick_search_sting = this.filter.innerText;

            if (this.quick_search_sting === '') {
                this.clear_filter();
            } else {
                this.filter.classList.add('active');
            }

            if (!this.specialKeys.includes(this.quick_search_sting) && this.quick_search_sting.match(/[a-z0-9-_.]/i)) {
                let active_tab_content = document.querySelector('.active-tab-content');
                let items = active_tab_content.querySelectorAll('.card, .tr');
                items.forEach((item) => {
                    if (item.dataset.name.toLocaleLowerCase().includes(this.quick_search_sting)) {
                        item.classList.remove('hidden');
                    } else {
                        item.classList.remove('highlight_select');
                        item.classList.add('hidden');
                    }
                })

                // reset nav idx for up down navigation
                // navigation.clearNavIdx();

                // set indexes for up down navigation
                // navigation.getCardGroups();

            }

        }, 100);

    }

    // clear filter
    clear_filter() {

        let active_tab_content = tabManager.get_active_tab_content(); //document.querySelector('.active-tab-content');
        let cards = active_tab_content.querySelectorAll('.card, .tr');
        cards.forEach((card) => {
            card.classList.remove('hidden');
        })

        let filter = document.querySelector('.filter');
        if (filter) {
            filter.innerText = '';
            filter.classList.remove('active');
        } else {
            console.log('no filter');
        }

        // utilities.set_msg(`Loaded ${cards.length} items`);

        // reset nav idx for up down navigation
        // navigation.clearNavIdx();

        // set indexes for up down navigation
        // navigation.getCardGroups();

    }

    // sanitize file name
    sanitize_file_name(href) {
        return href.replace(/\n/g, ' ');
    }

    // overwrite


    // chunk load files array
    chunk_load_files(idx, files_arr, table) {

        const last_idx = Math.min(idx + this.chunk_size, files_arr.length);
        const chunk = files_arr.slice(idx, last_idx);

        console.log('loading next chunk', idx);
        let start = new Date().getTime();
        chunk.forEach(f => {
            let tr = this.get_list_view_item(f);
            table.appendChild(tr);
        });
        let end = new Date().getTime();
        console.log('chunk load time', (end - start) / 1000);

        idx += this.chunk_size;

        // Check if more chunks need to be loaded
        if (idx < files_arr.length) {
            setTimeout(() => {
                this.chunk_load_files(idx, files_arr, table);
            }, 0);
            // this.chunk_load_files(idx, files_arr, table);
        } else {
            if (files_arr.length > 0) {
                utilities.set_msg(`Loaded ${files_arr.length} items`);
            }
        }

    }

    // get grid view
    get_grid_view(files_arr) {

        utilities.clear_filter();

        // active tab content
        let active_tab_content = tabManager.get_active_tab_content();
        if (!active_tab_content) {
            this.tabManager.add_tab(utilities.get_location());
            active_tab_content = document.querySelector('.active-tab-content');
        }
        active_tab_content.innerHTML = '';

        // scroll to top of active tab content
        active_tab_content.scrollTop = 0;

        let grid = document.createElement('div');
        grid.classList.add('grid', 'grid3');

        // sort files array
        files_arr = utilities.sort(files_arr, this.sort_by, this.sort_direction);

        for (let i = 0; i < files_arr.length; i++) {

            let card = utilities.add_div(['card', 'lazy']) //this.get_grid_view_item(f);
            card.dataset.id = files_arr[i].id;
            card.dataset.href = files_arr[i].href;
            card.dataset.name = files_arr[i].name;
            card.dataset.size = files_arr[i].size;
            card.dataset.mtime = files_arr[i].mtime;
            card.dataset.content_type = files_arr[i].content_type;
            card.dataset.is_dir = files_arr[i].is_dir;
            card.dataset.location = files_arr[i].location;
            card.dataset.content_type = files_arr[i].content_type;
            grid.appendChild(card);

        }

        active_tab_content.appendChild(grid);
        this.lazy_load_files(files_arr);

    }

    // get grid view item
    get_grid_view_item(f) {

        // loop f to make sure its complete
        for (let items in f) {
            if (f[items] === undefined || f[items] === null) {
                console.log('error getting grid view item', f);
                return -1;
            }
        }

        let card = utilities.add_div(['card']);
        let content = utilities.add_div(['content']);
        let icon = utilities.add_div(['icon']);
        let img = document.createElement('img');
        let video = document.createElement('video');
        let header = utilities.add_div(['header', 'item']);
        let href = document.createElement('a');
        let path = utilities.add_div(['path', 'item', 'hidden']);
        let mtime = utilities.add_div(['date', 'mtime', 'item']);
        let atime = utilities.add_div(['date', 'atime', 'item', 'hidden']);
        let ctime = utilities.add_div(['date', 'ctime', 'item', 'hidden']);
        let size = utilities.add_div(['size', 'item']);
        let type = utilities.add_div(['type', 'item', 'hidden']);
        let count = utilities.add_div(['count', 'item', 'hidden']);
        let input = document.createElement('input');
        let tooltip = utilities.add_div('tooltip', 'hidden');

        href.classList.add('href', 'item');
        input.classList.add('input', 'item', 'hidden', 'edit_name');

        icon.style = 'cursor: pointer';

        img.classList.add('img');
        img.loading = 'lazy';

        card.classList.add('lazy');
        // card.style.opacity = 1;

        // Populate values
        href.href = f.href;
        href.innerHTML = f.display_name;
        input.value = f.display_name;

        input.spellcheck = false;
        input.type = 'text';
        input.dataset.href = f.href;

        href.draggable = false;
        img.draggable = false;
        icon.draggable = false;
        card.draggable = true;

        // Check file values
        if (f.size) {
            card.dataset.size = f.size;
        }
        if (f.mtime) {
            mtime.append(utilities.get_date_time(f.mtime));
        }
        if (f.ctime) {
            ctime.append(utilities.get_date_time(f.ctime));
        }
        if (f.atime) {
            atime.append(utilities.get_date_time(f.atime));
        }
        if (f.content_type) {
            type.append(f.content_type);
        }

        card.querySelectorAll('.item').forEach(item => {
            item.draggable = false;
        })

        icon.append(img);
        header.append(href, input);

        // Directory
        if (f.is_dir || f.type === 'inode/directory') {

            ipcRenderer.send('get_folder_icon', f.href);
            ipcRenderer.send('get_folder_size', f.href);

            // is_dir = 1;

            card.classList.add('folder_card', 'lazy');

            // Context Menu
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                card.classList.add('highlight_select')
                ipcRenderer.send('folder_menu', f);
            })

            // Files
        } else {

            size.append(utilities.get_file_size(f["size"]));

            // Context Menu
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                card.classList.add('highlight_select')
                ipcRenderer.send('file_menu', f);
            })

        }

        // // Handle events
        this.handleDragStart(card);
        this.handleDragOver(card);
        this.handleDragLeave(card);
        this.handleDrop(card);

        this.handleDataAttributes(card, f);
        this.handleTitle(card, f);
        this.handleRename(input, f);

        // Get Icon
        this.handleIcon(icon, f);

        // handle click events - Card click is handled in drag select
        this.handleClick(card, f);
        this.handleClick(href, f);
        this.handleClick(img, f);

        content.append(header, path, mtime, ctime, atime, type, size, count);
        card.append(icon, content, tooltip);

        return card;
    }

    // get list view
    get_list_view(files_arr) {

        utilities.clear_filter();

        // const start = this.loaded_rows;
        // const end = Math.min(start + this.chunk_size, files_arr.length);

        // Set up tab content
        let active_tab_content = tabManager.get_active_tab_content();
        if (!active_tab_content) {
            this.tabManager.add_tab(utilities.get_location());
            active_tab_content = document.querySelector('.active-tab-content');
        }
        active_tab_content.innerHTML = '';

        // scroll to top of active tab content
        active_tab_content.scrollTop = 0;

        let table = document.createElement('table');
        table.classList.add('table');

        let thead = document.createElement('thead');
        let tr = document.createElement('tr');

        let tbody = document.createElement('tbody');

        this.settings = settingsManager.get_settings();
        this.list_view_settings = settingsManager.get_list_view_settings();

        for (const key in this.settings.columns) {
            if (this.settings.columns[key]) {

                let th_sort_icon = document.createElement('i');
                th_sort_icon.classList.add('th_sort_icon');
                if (this.settings.sort_by === key) {

                    // th_sort_icon.classList.add('bi', 'bi-caret-up-fill');
                    if (this.settings.sort_direction === 'desc') {
                        th_sort_icon.classList.remove('bi', 'bi-caret-up-fill');
                        th_sort_icon.classList.add('bi', 'bi-caret-down-fill');
                    } else {
                        th_sort_icon.classList.remove('bi', 'bi-caret-down-fill');
                        th_sort_icon.classList.add('bi', 'bi-caret-up-fill');
                    }
                }

                let drag_handle = document.createElement('div');
                drag_handle.classList.add('drag_handle');

                let th = document.createElement('th');
                th.classList.add('sort_column');

                // handle name column
                if (key === 'name') {

                    th.innerHTML = 'Name';
                    th.appendChild(drag_handle);
                    th.dataset.col_name = key;
                    tr.appendChild(th);

                    th.style.width = this.list_view_settings.col_width[key] + 'px';

                } else {

                    // let th = document.createElement('th');

                    switch (key) {
                        case 'size':
                            th.innerHTML = 'Size';
                            break;
                        case 'mtime':
                            th.innerHTML = 'Modified';
                            break;
                        case 'ctime':
                            th.innerHTML = 'Created';
                            break;
                        case 'atime':
                            th.innerHTML = 'Accessed';
                            break;
                        case 'type':
                            th.innerHTML = 'Type';
                            break;
                        case 'location':
                            th.innerHTML = 'Location';
                            break;
                        case 'count':
                            th.innerHTML = 'Count';
                            break;
                    }

                    th.appendChild(th_sort_icon);
                    th.appendChild(drag_handle);
                    th.dataset.col_name = key;
                    tr.appendChild(th);

                    th.style.width = this.list_view_settings.col_width[key] + 'px';

                }

                // init resize column
                drag_handle.addEventListener('mousedown', (e) => {
                    this.init_col_resize(e);
                });

                // handle sort event
                this.handleColumnSort(th, key);

            }

        }

        // table.appendChild(colgroup);
        thead.appendChild(tr);
        table.appendChild(thead);
        table.appendChild(tbody);

        // sort files array
        files_arr = utilities.sort(files_arr, this.settings.sort_by, this.settings.sort_direction);

        files_arr.forEach((f, idx) => {
            let tr = document.createElement('tr'); //this.get_list_view_item(f);
            tr.classList.add('tr', 'lazy');
            tr.dataset.id = f.id;
            tr.dataset.href = f.href;
            tr.dataset.name = f.name;
            tr.dataset.size = f.size;
            tr.dataset.mtime = f.mtime;
            tr.dataset.content_type = f.content_type;
            tr.dataset.is_dir = f.is_dir;
            tr.dataset.location = f.location;
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        active_tab_content.appendChild(table);
        this.lazy_load_files(files_arr);

        // dragSelect.drag_select();

        thead.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            ipcRenderer.send('columns_menu');
        })

        active_tab_content.addEventListener('mouseover', (e) => {
            e.target.focus();
        });


    }

    // add_list_view_item(f) {
    get_list_view_item(f) {

        // loop f to make sure its complete
        for (let items in f) {
            if (f[items] === undefined || f[items] === null) {
                console.log('error getting grid view item', f);
                return -1;
            }
        }

        let tr = document.createElement('tr');
        tr.classList.add('tr');

        // add data attributes from column settings
        this.handleDataAttributes(tr, f);

        // add hover over title
        this.handleTitle(tr, f);

        let div_name = utilities.add_div(['div_name']);
        let icon = utilities.add_div(['icon']);
        let img = document.createElement('img');
        let input = document.createElement('input');
        let link = utilities.add_link(f.href, f.name);

        // input settings
        input.type = 'text';
        input.value = f.name;
        input.classList.add('edit_name', 'hidden');
        input.spellcheck = false;

        icon.style = 'cursor: pointer';
        img.classList.add('img');
        img.loading = 'lazy';

        link.draggable = false;
        link.classList.add('href');

        // handle columns
        this.settings = settingsManager.get_settings();
        for (const key in this.settings.columns) {
            if (this.settings.columns[key]) {

                let td = document.createElement('td');

                // handle name column
                if (key === 'name') {

                    img.loading = 'lazy';
                    icon.appendChild(img);

                    td.classList.add('name');

                    div_name.append(icon, link, input);
                    td.append(div_name);

                    // tr.appendChild(td_icon);
                    tr.appendChild(td);

                    // handle icons
                    if (f.is_dir) {

                        ipcRenderer.send('get_folder_icon', f.href);
                        ipcRenderer.send('get_folder_size', f.href);

                    } else {

                        this.handleIcon(icon, f);

                    }

                    // handle click events
                    this.handleClick(tr, f);
                    this.handleClick(link, f);
                    this.handleClick(img, f);

                    // handle rename
                    this.handleRename(input, f);

                } else {

                    switch (key) {
                        case 'size':
                            td.innerHTML = utilities.get_file_size(f.size);
                            td.classList.add('size');
                            break;
                        case 'mtime':
                            td.innerHTML = utilities.get_date_time(f.mtime);
                            break;
                        case 'ctime':
                            td.innerHTML = utilities.get_date_time(f.ctime);
                            break;
                        case 'atime':
                            td.innerHTML = utilities.get_date_time(f.atime);
                            break;
                        case 'type':
                            td.innerHTML = f.content_type;
                            break;
                        default:
                            td.innerHTML = f[key];
                            break;
                    }

                    td.dataset.col_name = key;
                    tr.appendChild(td);

                }

            }

        }

        // handle context menu
        if (f.is_dir) {

            // handle folder context menu
            tr.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                tr.classList.add('highlight_select');
                ipcRenderer.send('folder_menu', f);
            })

        } else {

            // handle file context menu
            tr.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                tr.classList.add('highlight_select');
                ipcRenderer.send('file_menu', f);
            })
        }

        return tr;

    }

    // handleDrag

    // sort event
    handleColumnSort(item) {

        item.addEventListener('click', (e) => {

            e.preventDefault();
            e.stopPropagation();

            if (this.is_resizing) {
                return;
            }

            console.log('running sort by column', e.target);
            this.settings.sort_by = e.target.dataset.col_name;
            this.settings.sort_direction = this.settings.sort_direction === 'asc' ? 'desc' : 'asc';
            settingsManager.update_settings(this.settings);
            this.get_files(this.location);

        });

    }

    // handle title
    handleTitle(item, f) {

        let title =
            'Name: ' + f.display_name +
            '\n' +
            'Location: ' + f.location +
            '\n' +
            'Size: ' + utilities.get_file_size(f.size) +
            '\n' +
            'Accessed: ' + utilities.get_date_time(f.atime) +
            '\n' +
            'Modified: ' + utilities.get_date_time(f.mtime) +
            '\n' +
            'Created: ' + utilities.get_date_time(f.ctime) +
            '\n' +
            'Type: ' + f.content_type

        item.title = title;

    }

    // handle data attributes
    handleDataAttributes(item, f) {

        item.dataset.id = f.id;
        item.dataset.href = f.href;
        item.dataset.name = f.name;
        item.dataset.mtime = f.mtime;
        item.dataset.atime = f.atime;
        item.dataset.ctime = f.ctime;
        item.dataset.size = f.size;
        item.dataset.type = f.content_type;
        item.dataset.is_dir = f.is_dir;
        item.dataset.location = f.location;
        item.dataset.content_type = f.content_type;

    }

    // handle icon
    handleIcon(icon, f) {

        for (let field in f) {
            if (f[field] === undefined || f[field] === null) {
                console.log('error getting icon', f);
                return -1;
            }
        }

        if (icon === undefined || icon === null) {
            const errorMessage = `Error loading icon ${icon}`;
            console.log(errorMessage);
            utilities.set_msg(errorMessage);
            if (err && typeof err === 'function') {
            err(errorMessage);
            }
            return -1;
        }

        if (f.href === undefined || f.href === null) {
            console.log('Error getting icon href', f.href);
            utilities.set_msg(`Error getting href ${f.href}`);
            return -2;
        }

        if (f.content_type === undefined || f.content_type === null) {
            console.log('Error getting icon content type', f.content_type);
            utilities.set_msg(`Error getting icon content type ${f.content_type}`);
            return -3;
        }

        let img = icon.querySelector('.img');
        if (!img) {
            console.log('Error getting .img for icon', img);
            utilities.set_msg('Error getting .img for icon');
            return -4;
        }

        // console.log('running handle icon', f);
        this.settings = settingsManager.get_settings();

        try {

            if (f.is_dir || f.type === 'inode/directory') {

                ipcRenderer.send('get_folder_icon', f.href);

            } else if (f.is_dir === false) {

                if (f.content_type.includes('image/')) {

                    // check for svg
                    if (f.content_type.includes('svg')) {
                        img.src = f.href;
                        img.classList.add('svg');
                    } else {
                        img.src = f.href;
                    }


                } else if (f.content_type.includes('video/')) {

                    let video = document.createElement('video');
                    video.src = f.href;
                    video.classList.add('video');
                    icon.innerHTML = '';
                    icon.append(video);

                } else {
                    img.classList.add('lazy');
                    ipcRenderer.invoke('get_icon', f.href).then(icon => {
                        img.src = icon;
                    })
                }

            }

            if (!f.is_writable) {
                icon.classList.add('readonly');
                let readonly_img = document.createElement('img');
                ipcRenderer.invoke('get_readonly_icon', f.href).then(readonly_icon => {
                    console.log('readonly icon', readonly_icon);
                    readonly_img.src = readonly_icon;
                    readonly_img.classList.add('symlink');
                    icon.append(readonly_img);
                })
            }

            if (f.is_symlink) {
                let symlink_img = document.createElement('img');
                ipcRenderer.invoke('get_symlink_icon', f.href).then(symlink_icon => {
                    symlink_img.src = symlink_icon;
                    symlink_img.classList.add('symlink');
                    icon.append(symlink_img);
                })
            }

            img.style.width = `${this.settings.icon_size}px`;
            img.style.height = `${this.settings.icon_size}px`;

        } catch (err) {

            console.log('Error loading icon', err);
            utilities.set_msg(`Error loading icon ${err}`);

            ipcRenderer.invoke('get_icon', (f.href)).then(res => {
                img.src = res;
            })

            img.style.width = `${this.settings.icon_size}px`;
            img.style.height = `${this.settings.icon_size}px`

        }

        return 0;

    }

    // handle dragstart
    handleDragStart(item) {

        item.addEventListener('dragstart', (e) => {

            // e.stopPropagation();
            e.dataTransfer.effectAllowed = 'copyMove';
            this.is_dragging = true;
            this.is_dragging_divs = true;

        })
    }

    // handle drag over
    handleDragOver(item) {

        item.addEventListener('dragover', (e) => {

            e.preventDefault();

            if (item.dataset.is_dir === 'true') {
                // Add highlight only if not already highlighted
                if (!item.dataset.dragover) {
                    item.dataset.dragover = 'true';
                    item.classList.add('highlight_target');
                }

                if (this.ctrlKey) {
                    e.dataTransfer.dropEffect = "copy";
                    utilities.set_msg(`Copy items to ${item.dataset.href}`);
                } else {
                    e.dataTransfer.dropEffect = "move";
                    utilities.set_msg(`Move items to ${item.dataset.href}`);
                }
                utilities.set_destination(item.dataset.href);
                // utilities.set_msg(`Destination: ${item.dataset.href}`);
            } else {
                // handle drag/drop on active tab content
            }

        })

    }

    // handle dragleave
    handleDragLeave(item) {
        item.addEventListener('dragleave', (e) => {
            if (item.dataset.dragover === 'true') {
                delete item.dataset.dragover;
                item.classList.remove('highlight_target');
            }
        })
    }

    // handle drop
    handleDrop(item) {

        item.addEventListener('drop', (e) => {

            e.preventDefault();
            e.stopPropagation();

            ipcRenderer.send('is_main', 0);

            if (!item.classList.contains('highlight') && item.classList.contains('highlight_target')) {

                // the ctrl key is not firing
                utilities.copy();
                if (e.ctrlKey) {
                    console.log('running drop ctrl', item.dataset.href);
                    utilities.paste();
                } else {
                    console.log('running drop', item.dataset.href);
                    utilities.move();
                }

            } else {

                console.log('did not find target')
                ipcRenderer.send('is_main', 1);
                utilities.copy();
                utilities.paste();

            }
            utilities.clear();
            dragSelect.set_is_dragging(true);
        })

    }

    // handle rename
    handleRename(input, f) {

        input.addEventListener('keydown', (e) => {

            if (e.key === 'Enter') {
                let id = f.id;
                let source = f.href;
                let destination = source.split('/').slice(0, -1).join('/') + '/' + input.value;
                utilities.rename(source, destination, id);
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                utilities.cancel_edit();
            }
        })

    }

    // handle click event
    handleClick(item, f) {

        if (item === null || item === undefined) {
            utilities.set_msg('Error: handleClick - item is null or undefined');
            return;
        }

        if (f === null || f === undefined) {
            utilities.set_msg('Error: handleClick - file is null or undefined');
            return;
        }

        if (item.classList.contains('card') || item.classList.contains('tr')) {

            item.addEventListener('click', (e) => {

                e.preventDefault();
                e.stopPropagation();

                if (e.ctrlKey) {
                    item.classList.toggle('highlight_select');
                } else {
                    this.clearHighlight();
                    item.classList.add('highlight_select');
                }

            })

            return;

        }

        item.addEventListener('click', (e) => {

            e.preventDefault();
            e.stopPropagation();

            if (f.is_dir === true) {

                if (!f.is_readable) {
                    utilities.set_msg('Error: Access Denied');
                    return;
                }

                if (e.ctrlKey) {
                    tabManager.add_tab(f.href);
                    this.get_files(f.href);
                } else {
                    this.get_files(f.href);
                }

                utilities.set_location(f.href);

            } else if (f.is_dir === false) {
                console.log('running handle click file', f.href);
                ipcRenderer.send('open', f.href);
            }

            this.clearHighlight();

        });

    }

    clearHighlight() {
        let active_tab_content = document.querySelector('.main');
        let items = active_tab_content.querySelectorAll('.highlight, .highlight_select');
        items.forEach((item) => {
            item.classList.remove('highlight', 'highlight_select');
        })
    }

    // lazy load files
    lazy_load_files(files_arr) {

        let active_tab_content = document.querySelector('.active-tab-content');
        let lazyItems = active_tab_content.querySelectorAll(".lazy");

        console.log('running lazy load files', lazyItems.length);

        // listen for scroll event
        if ("IntersectionObserver" in window) {
            let observer = new IntersectionObserver(function (entries, observer) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        load_item(entry.target, observer);
                        // console.log('lazy load item', entry.target.dataset.id);
                    }
                });
            });

            // Immediately load items that are already in viewport
            lazyItems.forEach((lazy_item, idx) => {

                if (isInViewport(lazy_item)) {

                    setTimeout(() => {
                        load_item(lazy_item, observer);
                    }, 10);

                } else {

                    observer.observe(lazy_item);

                }

                if (idx === 0) {
                    //     active_tab_content.addEventListener('mouseover', (e) => {
                    //         e.target.focus();
                    //     });
                }

                if (idx === lazyItems.length - 1) {
                    utilities.set_msg(`Loaded ${files_arr.length} items`);
                    setTimeout(() => {
                        dragSelect.initialize();
                    }, 500);
                }

            });

            function isInViewport(element) {
                const rect = element.getBoundingClientRect();
                return (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                );
            }

            // Function to load the item
            const load_item = (lazy_item, observer) => {

                const id = lazy_item.dataset.id;
                if (id) {

                    let f = files_arr.find(f => f.id === id);
                    let item;

                    // console.log('lazy load view', this.view);

                    if (this.view === 'list_view') {

                        item = this.get_list_view_item(f);
                        lazy_item.replaceWith(item);


                    } else if (this.view === 'grid_view') {

                        item = this.get_grid_view_item(f);
                        lazy_item.replaceWith(item);

                    }

                    this.handleDataAttributes(item, f);
                    this.handleTitle(item, f);

                    // Stop watching and remove the placeholder
                    lazy_item.classList.remove("lazy");
                    observer.unobserve(lazy_item);

                } else {
                    console.log('No lazy items load');
                }
            }

        } else {
            // Possibly fall back to a more compatible method here
        }


    }

    // create a breadcrumbs from location
    get_breadcrumbs(location) {

        console.log('running get breadcrumbs', location);

        let breadcrumbs = [];
        let breadcrumb_div = document.querySelector('.breadcrumbs');

        if (!breadcrumb_div) {
            return;
        }

        breadcrumb_div.innerHTML = '';

        if (location === '/') {

            let breadcrumb_item = document.createElement('div');
            let i = document.createElement('i');
            let label = document.createElement('div');

            breadcrumb_item.classList.add('breadcrumb_item', 'flex');
            i.classList.add('bi', 'bi-hdd');
            label.innerHTML = `File System`;

            breadcrumb_item.append(i);
            breadcrumb_item.title = `File System`;

            breadcrumb_div.append(breadcrumb_item);

            return;

        }


        breadcrumbs = location.split('/');
        if (breadcrumbs.length > 0) {

            breadcrumbs.forEach((breadcrumb, index) => {

                if (breadcrumb !== '' && breadcrumb !== 'home') {

                    let breadcrumb_item = document.createElement('div');
                    let i = document.createElement('i');
                    let label = document.createElement('div');


                    breadcrumb_item.classList.add('breadcrumb_item', 'flex');
                    i.classList.add('bi', 'bi-home');
                    label.innerHTML = breadcrumb;

                    breadcrumb_item.append(label);
                    breadcrumb_item.title = `${breadcrumb}`;
                    breadcrumb_item.addEventListener('click', (e) => {

                        e.preventDefault();
                        e.stopPropagation();

                        let new_location = breadcrumbs.slice(0, index + 1).join('/');
                        this.get_files(new_location);
                        utilities.set_location(new_location);

                    });

                    breadcrumb_div.append(breadcrumb_item);

                }

            });
        }

        // click event for breadcrumbs div
        breadcrumb_div.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            utilities.show_location_input();
        });

    }

    // request files from location
    get_files(location) {

        console.log('running get_files', location);

        if (!location || location === '' || location === undefined) {
            utilities.set_msg('Error: get_files - location is empty');
            return;
        }

        utilities.set_msg(`<img src="../renderer/icons/spinner.gif" style="width: 12px; height: 12px" alt="loading" /> Loading...`);

        this.location = location;
        ipcRenderer.send('ls', this.location);

        settingsManager.set_location(this.location);

        utilities.set_location(this.location);
        utilities.set_destination(this.location);

        this.get_breadcrumbs(this.location);

        ipcRenderer.send('is_main', 1);

        // let main = document.querySelector('.main');
        // main.style.width = window.innerWidth + 'px';

    }

    // add copy_array items to the view
    add_items(copy_arr) {

        console.log('running add items');

        if (copy_arr.length === 0) {
            utilities.set_msg('Error: Add items - copy_arr is empty');
            return;
        }

        let active_tab_content = tabManager.get_active_tab_content();
        let items = active_tab_content.querySelectorAll('.card, .tr');
        if (!items) {
            utilities.set_msg('Error: Add items - No items found to add');
            return;
        }

        // get index of last directory
        let idx = 0;
        items.forEach((item, index) => {
            if (item.dataset.is_dir === 'true') {
                idx = index;
            }
        });

        if (this.view === 'grid_view') {

            let grid = active_tab_content.querySelector('.grid');
            if (!grid) {
                utilities.set_msg('Error: Add items - Could not find grid');
                return;
            }

            copy_arr.forEach(f => {

                // make sure f is complete
                for (let items in f) {
                    if (f[items] === undefined || f[items] === null) {
                        console.log('error getting grid view item', f);
                        return -1;
                    }
                }

                // f is wrong when sent from paste worker - wrong values
                let card = this.get_grid_view_item(f);
                if (f.is_dir === true) {
                    grid.prepend(card);
                } else {
                    grid.insertBefore(card, grid.childNodes[idx + 1]);
                }
                card.classList.add('highlight_select');
            })

        } else if (this.view === 'list_view') {

            let table = active_tab_content.querySelector('.table');
            if (!table) {
                utilities.set_msg('Error: Add items - Could not find table');
                return;
            }

            let tbody = table.querySelector('tbody');
            if (!tbody) {
                utilities.set_msg('Error: Add items - Could not find tbody');
                return;
            }

            copy_arr.forEach(f => {
                let tr = this.get_list_view_item(f);
                if (f.is_dir === true) {
                    table.prepend(tr);
                } else {
                    tbody.insertBefore(tr, tbody.childNodes[idx + 1]);
                }
                tr.classList.add('highlight_select');
            })

        }

        copy_arr = [];
    }

    // go back
    back() {
        // get previous directory
        this.location = this.location.split('/').slice(0, -1).join('/');
        ipcRenderer.send('ls', this.location);
        this.get_breadcrumbs(this.location);
    }

    // go forward
    forward() {
        ipcRenderer.send('ls', this.location);
        this.get_breadcrumbs(this.location);
    }

}

class PropertiesManager {

    constructor() {

        ipcRenderer.on('properties', (e, properties_arr) => {
            this.show_properties(properties_arr);
        })

    }

    // show_properties(properties_arr) {

    //     console.log('properties_arr', properties_arr);
    //     tabManager.add_tab('Properties');
    //     const active_tab_content = document.querySelector('.active-tab-content');
    //     let properties_div = utilities.add_div(['properties']);
    //     active_tab_content.appendChild(properties_div);

    //     if (properties_arr.length > 0) {
    //         properties_arr.forEach((properties, index) => {
    //             let properties_table = this.get_properties_table(properties);
    //             properties_div.appendChild(properties_table);
    //         });
    //     }

    // }

    show_properties(properties_arr) {

        tabManager.add_tab('Properties');
        let active_tab_content = document.querySelector('.active-tab-content');

        if (properties_arr.length > 0) {

            properties_arr.forEach(file => {

                console.log('file', file);

                let properties_div1 = utilities.add_div();
                let basic_content = utilities.add_div();
                let permissions_content = utilities.add_div();

                properties_div1.classList.add('properties_view', 'grid2');
                basic_content.classList.add('basic');
                permissions_content.classList.add('permissions');

                properties_div1.append(basic_content, permissions_content);
                active_tab_content.append(properties_div1);
                // tab_content.append(properties_div1);

                // Basic Tab
                let card = utilities.add_div();
                let content = utilities.add_div();

                card.dataset.properties_href = file.href;

                let close_btn = utilities.add_div();
                let close_icon = document.createElement('i');
                close_icon.classList.add('bi', 'bi-x');
                close_btn.classList.add('float', 'right', 'pointer');
                close_btn.append(close_icon);
                close_btn.addEventListener('click', (e) => {
                    card.remove()
                    let cards = document.querySelectorAll('.properties')
                    if (cards.length === 0) {
                        utilities.clear()
                        // navigation.sidebarHome();
                    }
                })

                content.classList.add('content');
                card.classList.add('properties');

                let icon = utilities.add_div();
                icon.classList.add('icon');
                card.append(icon);

                content.append(utilities.add_item('Name:'), utilities.add_item(file.display_name));

                let folder_count = utilities.add_div();
                folder_count.classList.add('item', 'folder_count');

                let size = utilities.add_div();
                size.classList.add('size');
                // size.append('Calculating..');

                content.append(utilities.add_item('Type:'), utilities.add_item(file.content_type));
                content.append(utilities.add_item(`Contents:`), folder_count);

                let location = utilities.add_item(file.location);
                location.title = file.location;

                content.append(utilities.add_item('Location:'), location);

                if (file.is_dir) {

                    // utilities.getFolderIcon(file).then(folder_icon => {
                    //     // console.log('folder_icon', folder_icon)
                    //     let icon_img = utilities.add_img(folder_icon);
                    //     icon_img.classList.add('icon48');
                    //     icon.append(icon_img);
                    // });

                    content.append(utilities.add_item('Size:'), utilities.add_item(size));

                    if (file.is_readable) {

                        // // Calculate Folder Count
                        // let spinner = utilities.add_img('assets/icons/spinner.gif');
                        // spinner.style = 'width: 12px; height: 12px;'

                        // size.append(spinner, ` Calculating...`);
                        // ipcRenderer.send('get_folder_count', file.href);

                        // // Calculate Folder Size
                        // spinner = utilities.add_img('assets/icons/spinner.gif');
                        // spinner.style = 'width: 12px; height: 12px;'

                        // folder_count.append(spinner, ` Calculating...`);
                        // // console.log('getting folder size')
                        // ipcRenderer.send('get_folder_size', file.href);

                    } else {

                        size.append('Unknown')
                        folder_count.append('Unknown')

                    }


                } else {

                    folder_count.append('1');
                    content.append(utilities.add_item('Size:'), utilities.add_item(utilities.get_file_size(file.size)));

                    ipcRenderer.invoke('get_icon', (file.href)).then(res => {

                        let icon_img;
                        if (file.content_type.indexOf('image/') > -1) {
                            icon_img = utilities.add_img(file.href);
                            icon_img.classList.add('icon48');
                            icon.append(icon_img);
                        } else {
                            icon_img = utilities.add_img(res);
                            icon_img.classList.add('icon48');
                            icon.append(icon_img);
                        }
                    })

                }

                if (!file.mtime) {
                    file.mtime = "";
                }
                if (!file.atime) {
                    file.atime = "";
                }
                if (!file.ctime) {
                    file.ctime = "";
                }

                content.append(utilities.add_item(`Modified:`), utilities.add_item(utilities.get_date_time(file.mtime)));
                content.append(utilities.add_item(`Accessed:`), utilities.add_item(utilities.get_date_time(file.atime)));
                content.append(utilities.add_item(`Created:`), utilities.add_item(utilities.get_date_time(file.ctime)));

                card.append(content);
                basic_content.append(card)

                // Permissions Tab
                let permissions = this.getPermissions(file.permissions);
                let rows = ['Owner', 'Access', 'Group', 'Access', 'Other', 'Access']
                let perm_key;

                if (!file.is_dir) {
                    rows.push('Execute')
                }

                for (let i = 0; i < rows.length; i++) {

                    let row = utilities.add_div(['flex', 'row']);
                    for (let ii = 0; ii < 2; ii++) {
                        let col = utilities.add_div();
                        if (ii == 0) {
                            col.classList.add('td');
                            col.append(rows[i]);
                        } else {
                            if (i % 2 === 0) {
                                perm_key = rows[i].toLowerCase();
                                if (file[perm_key]) {
                                    col.append(file[perm_key]);
                                }
                            } else {
                                col.append(this.getMappedPermissions(permissions[perm_key]));
                            }

                            if (rows[i] === 'Execute' && !file.is_dir) {

                                let chk_execute = document.createElement('input');
                                let label_execute = document.createElement('label');

                                label_execute.innerText = ' Allow executing file as program';
                                label_execute.htmlFor = 'chk_execute';

                                chk_execute.id = 'chk_execute';
                                chk_execute.type = 'checkbox';
                                col.append(chk_execute, label_execute);

                                if (file.is_execute) {
                                    chk_execute.checked = true;
                                }

                                chk_execute.addEventListener('click', (e) => {
                                    if (chk_execute.checked) {
                                        ipcRenderer.send('set_execute', file.href);
                                    } else {
                                        ipcRenderer.send('clear_execute', file.href);
                                    }
                                })

                            }
                        }

                        row.append(col);
                    }

                    if (i % 2 === 1) {
                        row.append(document.createElement('br'));
                    }
                    permissions_content.append(row);
                }

            })

        } else {
            active_tab_content.innerHTML = "Unable to get properties";
        }

    }

    getPermissions(unixMode) {

        // const special = unixMode & 0xF000;
        const user = (unixMode >> 6) & 0x7;
        const group = (unixMode >> 3) & 0x7;
        const other = unixMode & 0x7;

        // let p_arr = []
        // p_arr.push(user)
        // p_arr.push(group)
        // p_arr.push(other)

        // return p_arr;

        return {
            // special: special.toString(8),
            owner: user.toString(8),
            group: group.toString(8),
            other: other.toString(8)
        };
    }

    getMappedPermissions(permissionValue) {
        const symbolicMap = {
            0: 'None', //'---',
            1: '--x',
            2: '-w-',
            3: '-wx',
            4: 'Read-Only', // 'r--',
            5: 'Access Files', //r-x
            6: 'Read and Write', //'rw-',
            7: 'Create and Delete Files' //'rwx'
        };
        return symbolicMap[permissionValue];
    }

}

class Navigation {

    constructor(FileManager) {

        this.fileManager = FileManager;

        let back = document.getElementById('btn_back');
        let forward = document.getElementById('btn_forward');

        if (!back || !forward) {
            return;
        }

        back.addEventListener('click', () => {
            this.fileManager.back();
        });

        forward.addEventListener('click', () => {
            this.fileManager.forward();
        });

    }

}

class ViewManager {

    constructor() {
        this.view = 'list_view';
    }

    // get view
    get_view(source) {
        fileManager.get_files(source);
    }

}

class MenuManager {

    constructor() {

        this.location = utilities.get_location();
        this.main = document.querySelector('.main');

        if (!this.main) {
            return;
        }

        this.main.addEventListener('contextmenu', (e) => {
            this.location = utilities.get_location();
            ipcRenderer.send('main_menu', this.location);
        })

        // Context Menu Commands
        ipcRenderer.on('context-menu-command', (e, cmd) => {

            let location = this.location; //document.querySelector('.location');

            switch (cmd) {
                case 'rename': {
                    utilities.edit();
                    break;
                }
                case 'mkdir': {
                    utilities.mkdir();
                    break;
                }
                case 'cut': {
                    utilities.cut();
                    break;
                }
                case 'copy': {
                    utilities.copy();
                    break
                }
                case 'paste': {
                    utilities.paste();
                    break;
                }
                case 'delete': {
                    utilities.delete();
                    break;
                }
                case 'terminal': {

                    let items = document.querySelectorAll('.highlight, .highlight_select');
                    if (items.length > 0) {
                        items.forEach(item => {
                            let new_cmd = `gnome-terminal --working-directory='${item.dataset.href}'`;
                            console.log('new_cmd', new_cmd);
                            ipcRenderer.send('command', (e, new_cmd))
                        })
                    } else {
                        let new_cmd = `gnome-terminal`;
                        ipcRenderer.send('command', (e, new_cmd));
                    }
                    utilities.clear();


                    break;
                }
                case 'connect': {
                    ipcRenderer.send('connect');
                    break;
                }
                case 'add_workspace': {
                    let selected_files_arr = utilities.get_selected_files();
                    ipcRenderer.send('add_workspace', selected_files_arr);
                    selected_files_arr = [];
                    utilities.clear()
                    break;
                }
                case 'compress_xz': {
                    utilities.compress('tar.xz');
                    break
                }
                case 'compress_gz': {
                    utilities.compress('tar.gz');
                    break;
                }
                case 'compress_zip': {
                    utilities.compress('zip');
                    break;
                }
                case 'extract': {
                    utilities.extract();
                    break;
                }
                case 'properties': {
                    let selected_files_arr = utilities.get_selected_files();
                    ipcRenderer.send('get_properties', selected_files_arr);
                    selected_files_arr = [];
                    utilities.clear();
                    break;
                }
                case 'sidebar_properties': {
                    let sidebar = document.querySelector('.sidebar');
                    let items = sidebar.querySelectorAll('.item');
                    items.forEach(item => {
                        if (item.classList.contains('highlight_select')) {
                            let file_arr = [];
                            file_arr.push(item.dataset.href);
                            console.log('item', item.dataset.href);
                            ipcRenderer.send('get_properties', file_arr);
                            clearHighlight();
                        }
                    })

                    break;
                }
                case 'open_templates': {
                    ipcRenderer.invoke('get_templates_folder').then(path => {
                        fileManager.get_files(path);
                        // viewManager.getView(path, 1)
                    })
                    break;
                }
                case 'select_all': {
                    utilities.select_all();
                    break;
                }

            }

            utilities.clear_highlight();

        })

    }

}

class WindowManager {

    constructor() {

        let main = document.querySelector('.main');
        window.addEventListener('resize', (e) => {

            let window_settings = settingsManager.get_window_settings();
            console.log('window_settings', window_settings);

            if (window_settings.main_width !== 0) {
                main.style.width = window.innerWidth + 'px';
                window_settings.main_width = window.innerWidth;
                ipcRenderer.send('update_window_settings', window_settings);
            }

        })
    }

}

let eventManager
let utilities;
let settingsManager;
let km;
let viewManager;
let iconManager;
let tabManager;
let dragSelect;
let fileManager;
let propertiesManager;
let menuManager;
let deviceManager;
let workspaceManager;
let sideBarManager;
let windowManager;

// on document ready
document.addEventListener('DOMContentLoaded', (e) => {
    init();
});

// init
init = () => {

    eventManager = new EventManager();

    utilities = new Utilities();
    settingsManager = new SettingsManager();
    km = new KeyBoardManager(utilities);
    viewManager = new ViewManager();
    iconManager = new IconManager();
    tabManager = new TabManager();
    dragSelect = new DragSelect();
    fileManager = new FileManager(tabManager, iconManager);
    propertiesManager = new PropertiesManager();
    menuManager = new MenuManager();
    windowManager = new WindowManager();
    const navigation = new Navigation(FileManager);
    // const keyboardManager = new KeyBoardManager(utilities);

    // side bar init
    sideBarManager = new SideBarManager(utilities, fileManager);
    deviceManager = new DeviceManager();
    workspaceManager = new WorkspaceManager();

}
