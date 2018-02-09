import { mix } from '@chialab/proteins/src/mixin.js';
import { Emitter } from '@chialab/proteins/src/factory.js';
import { BaseMixin } from './base.js';

export const notifications = new Emitter();

export const ComponentMixin = (SuperClass) => class extends mix(SuperClass).with(BaseMixin) {
    constructor(...args) {
        super(...args);
        notifications.trigger('created', this);
        this.ready()
            .then(() => {
                this.isReady = true;
                if (this.requestedRender) {
                    this.render(...this.requestedRender);
                }
            });
    }

    render(...args) {
        if (!this.isReady) {
            this.requestedRender = args;
            return;
        }
        notifications.trigger('rendering', this);
        return super.render(...args);
    }

    factory(name) {
        let injected = this.getContext().getInjected();
        return injected && injected[name];
    }
};
