cmd_Debug/gio.node := ln -f "Debug/obj.target/gio.node" "Debug/gio.node" 2>/dev/null || (rm -rf "Debug/gio.node" && cp -af "Debug/obj.target/gio.node" "Debug/gio.node")
