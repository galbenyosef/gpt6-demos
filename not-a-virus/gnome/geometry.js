import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export function geometry(generation) {
    const [x, y] = global.get_pointer();
    const monitors = Main.layoutManager.monitors;
    const monitor = monitors.find(m => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height) ?? Main.layoutManager.primaryMonitor;
    if (!monitor) return null;
    const work = global.workspace_manager.get_active_workspace().get_work_area_for_monitor(monitor.index);
    return {
        pointer: [x, y], monitor: [monitor.x, monitor.y, monitor.width, monitor.height],
        work: [work.x, work.y, work.width, work.height], monitor_id: monitor.index,
        monitor_generation: generation, device_scale: global.display.get_monitor_scale(monitor.index),
        visible: !Main.overview.visible && !Main.sessionMode.isLocked && !global.display.get_monitor_in_fullscreen(monitor.index),
    };
}
