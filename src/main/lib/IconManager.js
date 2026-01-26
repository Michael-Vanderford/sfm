// getSymlinkIcon.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class IconManager {

    constructor() {

        this.home = require('os').homedir();
        this.icon_theme = this.get_icon_theme();
        this.theme_path = this.get_theme_path();

    }

    get_icon_theme() {
        return execSync('gsettings get org.gnome.desktop.interface icon-theme').toString().replace(/'/g, '').trim();
    }

    get_symlink_icon() {

        try {

            let icon_path = path.join(this.theme_path, 'emblem-symbolic-link.svg');
            if (!fs.existsSync(icon_path)) {
                icon_path = path.join(process.cwd(), 'src', 'assets', 'icons', 'emblem-symbolic-link.svg');
            }

            return icon_path;

        } catch (err) {

            console.error('Error in symlink_icon:', err);
            return path.join(__dirname, 'assets/icons/emblem-symbolic-link.svg');

        }

    }

    get_readonly_icon() {

        try {

            let icon_path = path.join(this.theme_path, 'emblem-readonly.svg');
            if (!fs.existsSync(icon_path)) {
                icon_path = path.join(process.cwd(), 'src', 'assets', 'icons', 'emblem-readonly.svg');
            }

            return icon_path;

        } catch (err) {
            console.log(err);
        }
    }

    get_theme_path() {

        const icon_theme = this.icon_theme; //execSync('gsettings get org.gnome.desktop.interface icon-theme').toString().replace(/'/g, '').trim();
        let icon_dir = path.join(__dirname, 'assets', 'icons');
        let theme_path = '';

        try {
            const search_paths = [
                path.join(this.home, '.local/share/icons'),
                path.join(this.home, '.icons'),
                '/usr/share/icons'
            ];

            // Find the first existing icon theme path
            const found_path = search_paths.find(icon_path => {
                const theme_path = path.join(icon_path, icon_theme);
                return fs.existsSync(theme_path);
            });

            if (found_path) {
                icon_dir = path.join(found_path, icon_theme);
            } else {
                icon_dir = path.join(__dirname, 'assets', 'icons', 'kora');
            }

            const icon_dirs = [
                'scalable/places/',
                'places@2x/48/',
                '32x32/places/',
                '64x64/places/',
                'places/scalable/',
                'scalable@2x/places/',
                'places/32/',
                'places/48/',
                'places/64/',
                'places/128/',
                'places/symbolic/',
                'scalable/'
            ].map(dir => path.join(icon_dir, dir));

            // Find the first existing icon directory
            theme_path = icon_dirs.find(dir => fs.existsSync(dir));

            // If no theme path found, use the fallback
            if (!theme_path) {
                theme_path = path.join(__dirname, 'assets/icons/');
            }

            // console.log('Using icon theme path:', theme_path);

            return theme_path;

        } catch (error) {
            console.error('Error in getIconThemePath:', error);
            return path.join(__dirname, 'assets/icons/');
        }
    }

    // get folder icon
    get_folder_icon(e, href) {

        try {

            const baseName = path.basename(href);

            const specialFolders = {
                'Documents': ['folder-documents', 'folder-document'],
                'Music': ['folder-music'],
                'Pictures': ['folder-pictures', 'folder-image'],
                'Videos': ['folder-videos', 'folder-video'],
                'Downloads': ['folder-downloads', 'folder-download'],
                'Desktop': ['folder-desktop']
            };

            const folderType = specialFolders[baseName] || ['folder', 'default-folder'];
            const extensions = ['.svg', '.png'];

            // Try to find a special folder icon first
            let final_icon = null;
            for (const type of folderType) {
                for (const ext of extensions) {
                    const iconPath = path.join(this.theme_path, `${type}${ext}`);
                    if (fs.existsSync(iconPath)) {
                        final_icon = iconPath;
                        break;
                    }
                }
                if (final_icon) break;
            }

            // If no special icon found, fall back to generic folder icons
            if (!final_icon) {
                const folder_icons = [
                    'folder.svg',
                    'folder.png',
                    'default-folder.svg',
                    'default-folder.png'
                ];

                final_icon = folder_icons.reduce((found, icon) => {
                    if (found) return found;
                    const icon_path = path.join(this.theme_path, icon);
                    return fs.existsSync(icon_path) ? icon_path : null;
                }, null);
            }

            // If still no icon found, use the ultimate fallback
            final_icon = final_icon || path.join(process.cwd(), 'src', 'assets', 'icons', 'folder.svg');

            return final_icon;
            // e.sender.send('set_folder_icon', href, final_icon);

        } catch (err) {
            console.error('Error in folder icon selection:', err);
            // e.sender.send('set_folder_icon', href, path.join(__dirname, '../assets/icons/folder.svg'));
            return path.join(__dirname, '../assets/icons/folder.svg');
        }

    }

}

module.exports = new IconManager();