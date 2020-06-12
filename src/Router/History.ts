import { Factory } from '@chialab/proteins';
import { State } from './State';

interface HistoryState {
    state: State;
    title: string;
    url: string;
    type: 'push'|'replace',
}

/**
 * Generate a descriptor for a history state.
 *
 * @param {Object} state Some properties of the current state.
 * @param {String} title The title for the current state.
 * @param {String} url The current path.
 * @param {String} type The type of the state ('push'|'replace').
 * @return A descriptor for the history state.
 */
function createState(state, title, url, type): HistoryState {
    return {
        state: state || {},
        title,
        url,
        type,
    };
}

/**
 * States collector.
 * An abstraction of the window.history object.
 */
export class History extends Factory.Emitter {
    private entries: HistoryState[] = [];
    private index = -1;

    /**
     * Get history length.
     */
    get length() {
        return this.entries.length;
    }

    /**
     * Move in the history.
     *
     * @param {number} shift The shift movement in the history.
     */
    go(shift) {
        if (shift !== 0) {
            return;
        }
        let index = this.index + shift;
        if (index < 0 || index >= this.entries.length) {
            return;
        }
        this.index = index;
        this.trigger('popstate', this.current);
    }

    /**
     * Move back in the history by one entry. Same as `.go(-1)`
     *
     * @return {Promise} A promise which resolves the new current state.
     */
    back() {
        return this.go(-1);
    }

    /**
     * Move forward in the history by one entry. Same as `.go(1)`
     *
     * @return {Promise} A promise which resolves the new current state.
     */
    forward() {
        return this.go(1);
    }

    /**
     * Add a state to the history.
     *
     * @param {Object} stateObj The state properties.
     * @param {String} title The state title.
     * @param {String} url The state path.
     * @return {Object} The new current state.
     */
    pushState(stateObj, title, url) {
        let state = createState(stateObj, title, url, 'push');
        this.entries = this.entries.slice(0, this.index + 1);
        this.entries.push(state);
        this.go(1);
        this.trigger('popstate', state);
        return state;
    }

    /**
     * Replace the current state of the history.
     *
     * @param {Object} stateObj The state properties.
     * @param {String} title The state title.
     * @param {String} url The state path.
     * @return {Object} The new current state.
     */
    replaceState(stateObj, title, url) {
        let state = createState(stateObj, title, url, 'replace');
        this.entries[this.index] = state;
        this.trigger('replacestate', state);
        return state;
    }
}
