import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {Controller} from './controller.js';
export default class NotAVirus extends Extension {
    enable() { this.controller = new Controller(this); }
    disable() { this.controller?.destroy(); this.controller = null; }
}
