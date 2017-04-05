import { mix } from './helpers/mixin.js';
import { Router } from '@chialab/router/src/router.js';
import { PageViewComponent } from './components/page.js';
import { internal } from './helpers/internal.js';
import { Factory } from './factory.js';
import { PluggableMixin } from './mixins/pluggable.js';
import { InjectableMixin } from './mixins/injectable.js';
import { Controller } from './controller.js';
import { UrlHelper } from './helpers/url.js';
import { Component } from './component.js';
import * as EXCEPTIONS from './exceptions.js';
import { bootstrap, IDOM, DOM } from '@dnajs/idom/index.observer.js';

class NavigationEntry {
    constructor(previous) {
        if (previous) {
            previous.resolver();
            this.previous = previous.promise;
        } else {
            this.previous = Promise.resolve();
        }
        this.promise = new Promise((resolve) => {
            this.resolver = resolve;
        });

        this.promise
            .then(() => {
                this.resolved = true;
            });
    }

    run(callback) {
        return new Promise((resolve, reject) => {
            this.previous
                .then(() => {
                    callback(this).then(resolve, reject);
                });
        });
    }
}

export class App extends mix(Factory).with(InjectableMixin, PluggableMixin) {
    /**
     * The component to use as page view.
     * @type {Component}
     */
    static get View() {
        return PageViewComponent;
    }
    /**
     * The constructor to use for app navigation.
     * It should replicate the same interface of @chialab/router.
     * @type {class}
     */
    static get Router() {
        return Router;
    }
    /**
     * Default router options.
     * @see @chialab/router options.
     * @type {Object}
     */
    get routeOptions() {
        return {
            dispatch: true,
        };
    }

    get routeRules() {
        return {};
    }
    constructor(element, config) {
        super();
        this.element = element;
        this.addReadyPromise(
            this.initialize(config)
        );
        this.ready()
            .then(() => this.start());
    }
    /**
     * Set up the application.
     *
     * @param {Element} element The element to use for application root.
     * @return {Promise} The initialization promise.
     */
    initialize(...args) {
        this.router = new this.constructor.Router(this.routeOptions);
        return this.handleNavigation()
            .then(() => super.initialize(...args))
            .then(() => this.handleComponents())
            .then(() => {
                this.registerRoutes();
                return Promise.resolve();
            }).catch((ex) => {
                this.onInitializeError(ex);
            });
    }

    getContext() {
        return this;
    }

    onInitializeError(ex) {
        // eslint-disable-next-line
        console.error(ex);
        // eslint-disable-next-line
        alert('Error occurred on application initialize.');
    }
    /**
     * Callback for plugins ready.
     * Handle plugins' routes and locales.
     *
     * @param {Plugin} plugin The plugin instance.
     */
    onPluginReady(plugin) {
        if (plugin.routeRules) {
            this.registerRoutes(plugin.routeRules);
        }
        this.addReadyPromise(
            this.injectMultiple(plugin.getInjected())
        );
    }
    /**
     * Start up the app.
     * Start the routing navigation.
     *
     * @return {Promise} The start up promise.
     */
    start() {
        this.router.on('*', () => {
            this.notFound();
        });
        return this.router.start();
    }

    registerRoutes(routeRules) {
        const callbacks = this.router.callbacks;
        routeRules = routeRules || this.routeRules;
        for (let k in routeRules) {
            if (routeRules.hasOwnProperty(k) && !callbacks.hasOwnProperty(k)) {
                let ruleMatch = routeRules[k];
                if (typeof ruleMatch === 'string') {
                    if (typeof this[ruleMatch] === 'function') {
                        this.router.on(k, (...args) =>
                            this.beforeRoute(...args).then((args2) =>
                                this[ruleMatch].call(this, ...args2)
                                    .then(() => this.afterRoute())
                            )
                        );
                    }
                } else {
                    let action;
                    if (Array.isArray(ruleMatch)) {
                        action = ruleMatch[1];
                        ruleMatch = ruleMatch[0];
                    }
                    if (ruleMatch.prototype instanceof Controller) {
                        this.router.on(k, (...args) => {
                            internal(this).lastNavigation = new NavigationEntry(internal(this).lastNavigation);
                            return internal(this).lastNavigation.run((entry) =>
                                this.beforeRoute(...args).then(() => {
                                    if (entry.resolved) {
                                        return entry.promise;
                                    }
                                    return this.dispatchController(ruleMatch)
                                        .then((ctr) => {
                                            let promise;
                                            ctr.setQueryParams(this.router.query());
                                            if (action && typeof ctr[action] === 'function') {
                                                promise = ctr[action].call(ctr, ...args);
                                            } else {
                                                promise = ctr.exec(...args);
                                            }
                                            return promise
                                                .then(() => {
                                                    if (entry.resolved) {
                                                        return entry.promise;
                                                    }
                                                    return this.dispatchView(ctr);
                                                });
                                        })
                                        .then(() =>
                                            this.afterRoute(...args)
                                        )
                                        .catch((err) => {
                                            if (!err || !(err instanceof EXCEPTIONS.RedirectException)) {
                                                try {
                                                    if (!this.throwException(err)) {
                                                        return Promise.reject(err);
                                                    }
                                                } catch (ex) {
                                                    return Promise.reject(ex);
                                                }
                                            }
                                            return Promise.resolve();
                                        });
                                })
                            );
                        });
                    }
                }
            }
        }
    }

    beforeRoute(...args) {
        return Promise.resolve(args);
    }

    afterRoute(...args) {
        return Promise.resolve(args);
    }

    backState() {
        return this.router.back();
    }

    forwardState() {
        return this.router.forward();
    }

    handleNavigation() {
        this.element.addEventListener('click', (ev) => {
            let elem = ev.target;
            while (elem && elem.tagName !== 'A') {
                elem = elem.parentNode;
            }
            if (elem && elem.tagName === 'A') {
                return this.handleLink(ev, elem, this);
            }
            return true;
        });
        return Promise.resolve();
    }

    handleLink(ev, ...args) {
        const plugins = this.getPluginInstances();
        for (let i = 0, len = plugins.length; i < len; i++) {
            let plugin = plugins[i];
            if (typeof plugin.handleLink === 'function') {
                if (!plugin.handleLink(ev, ...args)) {
                    return false;
                }
            }
        }
        let node = ev.target;
        let link = node.tagName === 'A' ? node : node.closest('a');
        if (link) {
            let href = link.getAttribute('href');
            let target = link.getAttribute('target');
            if (href && (!target || target === '_self') && !UrlHelper.isAbsoluteUrl(href)) {
                ev.preventDefault();
                ev.stopPropagation();
                this.navigate(href);
            }
        }
        return true;
    }

    handleComponents() {
        let lastComponent;
        Component.notifications.on('created', (elem) => {
            if (elem instanceof Component) {
                let scope = this._isRendering() ? this :
                    (lastComponent && lastComponent.getContext());
                if (scope === this) {
                    elem.setContext(scope);
                    this._addRendering(
                        elem.initialize()
                    );
                }
                lastComponent = elem;
            }
        });
        this._setRendering();
        bootstrap(this.element);
        this._unsetRendering();
        return this._rendered();
    }

    dispatchController(RequestedController, ...args) {
        let lastControllerRequest = internal(this).lastControllerRequest
            || Promise.resolve();
        return this.initClass(RequestedController, ...args)
            .then((ctr) => {
                let destroyCtr = Promise.resolve();
                let previousCtr = internal(this).currentController;
                if (previousCtr) {
                    destroyCtr = previousCtr.destroy();
                }
                lastControllerRequest = lastControllerRequest.then(() =>
                    destroyCtr.then(() => {
                        internal(this).currentController = ctr;
                        return ctr.ready()
                            .then(() => Promise.resolve(ctr))
                            .catch(() => Promise.reject(ctr));
                    })
                );
                internal(this).lastControllerRequest = lastControllerRequest;
                return lastControllerRequest;
            });
    }

    dispatchView(controller) {
        let oldPage = this.currentPage;
        let destroyPromise = oldPage ? oldPage.destroy() : Promise.resolve();
        return destroyPromise.then(() =>
            this.initClass(this.constructor.View)
                .then((page) => {
                    this.currentPage = page;
                    DOM.appendChild(this.element, page);
                    let renderPromise = Promise.resolve();
                    if (controller) {
                        controller.pipe((updatedResponse) => {
                            this.render(controller.render(updatedResponse));
                        });
                        renderPromise = this.render(controller.render(controller.getResponse()));
                    }
                    let shown = Promise.all([
                        renderPromise,
                        this.currentPage.show(!oldPage),
                    ]);
                    return shown.then(() => {
                        if (oldPage) {
                            DOM.removeChild(this.element, oldPage);
                        }
                        return Promise.resolve(page);
                    });
                })
        );
    }

    render(renderFn) {
        this._setRendering();
        IDOM.patch(this.currentPage.node, renderFn);
        this._unsetRendering();
        return this._rendered();
    }

    navigate(...args) {
        return this.router.navigate(...args);
    }

    refresh() {
        return this.router.refresh();
    }

    throwException(err) {
        if (err && err instanceof EXCEPTIONS.AppException) {
            if (!this.handleException(err)) {
                throw err;
            }
            return true;
        }
        return false;
    }

    handleException(err) {
        if (err instanceof EXCEPTIONS.ContentNotFoundException) {
            this.notFound();
            return true;
        } else if (err instanceof EXCEPTIONS.ContentErrorException) {
            this.error();
            return true;
        }
        return false;
    }

    notFound() {
        // NOT FOUND
        return Promise.resolve();
    }

    error() {
        // ERROR
        return Promise.resolve();
    }
    /**
     * Set the application in rendering mode.
     * @private
     */
    _setRendering() {
        internal(this).rendering = true;
        internal(this).renderingPromises = [];
    }
    /**
     * Unset the application from rendering mode.
     * @private
     */
    _unsetRendering() {
        internal(this).rendering = false;
    }
    /**
     * Add a rendering promise.
     * @private
     *
     * @param {Promise} rendering The promise to add to rendering queue.
     */
    _addRendering(rendering) {
        internal(this).renderingPromises.push(rendering);
    }
    /**
     * Check if app is in rendering mode.
     * @private
     *
     * @return {Boolean}
     */
    _isRendering() {
        return !!internal(this).rendering;
    }
    /**
     * Return the rendering resolution queue.
     * @private
     *
     * @return {Promise} Resolves when all rendering promieses are resolved.
     */
    _rendered() {
        return Promise.all(internal(this).renderingPromises);
    }
}
