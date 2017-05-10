/**
 * Copyright 2017 Comcast Cable Communications Management, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// shorthand for commonly used function
const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * Holds the subscription function, an id for the function, and the context to
 * applied when calling it.
 */
class Subscription {
    public id: string;

    constructor(public fn: Function, public context: Object) {
        this.id = Subscription.hashFn(fn);
    }

    static hashFn(fn: Function): string {
        return Subscription.hashStr(fn.toString().replace(/\s/g,''));
    }

    static hashStr(str: string): string {
        let hash: number = 0;
        let idx: number = 0;
        for (; idx < str.length; idx++) {
            // This inner bit is from SO, interesting optimization.
            // http://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript-jquery
            hash  = ((hash << 5) - hash) + str.charCodeAt(idx);
            hash |= 0; // Convert to 32bit integer
        }
        return hash.toString();
    }

    public applyToCallback(args: Array<any>): void {
        this.fn.apply(this.context, args);
    }

    public toString(): string {
        return `${this.context ? this.context.constructor.name : this.context}::${this.fn.name || "anonymous"}`;
    }
}

/**
 * Doubly Linked List Node
 */
class DLLNode {
    public prev: DLLNode | null = null;
    public next: DLLNode | null = null;
    public subscription: Subscription;

    constructor(subscriptionFn: Function, context: Object, public priority: number) {
        this.subscription = new Subscription(subscriptionFn, context);
    }
}


export interface MediatorChannel {
    stopPropagation: Function;
}

/**
 * A channel exists per supsciption key, it's name it the key being subscribed
 * or published to.
 */
class Channel implements MediatorChannel {
    public CLEAR_BITS: number;
    public SIG_INT: number;
    public PUBLISHING: number;

    // Bitfield for if the channel is publishing or has been interrupted
    private _commandMask: number = 0;
    // At each index is the head of a doubly linked list,
    // potentially sparsely populated // TODO: test this.
    private _priorityMatrix: Array<DLLNode | undefined> = [];
    // Allows collisions with an array at each key
    private _fnHashMap: { [x: string]: Array<DLLNode> } = Object.create(null);
    private _callingNode: DLLNode | null = null;

    constructor(public namespace: string/* Mediator backwards compatibility */) { }

    public hasSubscribers(): boolean {
        return Object.keys(this._fnHashMap).length > 0;
    }

    public interrupt(): void {
        this._commandMask |= this.SIG_INT;
    }

    // Mediator backwards compatibility
    public stopPropagation: Function;


    public publish(args: Array<any>): void {
        let node: DLLNode | null | undefined = null;
        let idx: number = 0;
        if (this._commandMask & this.PUBLISHING) {
            setTimeout(this.publish.bind(this), 0, args);
            return;
        }
        this._commandMask |= this.PUBLISHING;
        for (; idx < this._priorityMatrix.length; idx++) {
            node = this._priorityMatrix[idx];
            while(node) {
                if (this._commandMask & this.SIG_INT) {
                    this._commandMask &= this.CLEAR_BITS;
                    return;
                }
                this._callingNode = node;
                // TODO(estobbart): We don't allow the publish to be interrupted
                // here, this may not be the most ideal situation. We may
                // want to continue publishing without intervention (setTimeout),
                // or be able to continue where we left off through an API called
                // by the handler.
                // May mean an additional flag to be set, etc.
                // Something like.. pubsub.continue(channelName, data);
                try {
                    node.subscription.applyToCallback(args.concat(this));
                } catch(err) {
                    console.error("Publish error <" + err + "> from subscriber - " + node.subscription);
                }
                this._callingNode = null;
                node = node.next;
            }
        }
        this._commandMask &= this.CLEAR_BITS;
    }

    public subscribe(fn: Function, priority: number, context: Object): void {
        let node: DLLNode = new DLLNode(fn, context, priority);
        let last: DLLNode;

        if (!hasOwnProperty.call(this._fnHashMap, node.subscription.id)) {
            this._fnHashMap[node.subscription.id] = [];
        } else {
            // This is a check to see if we can properly remove the function
            // we've been passed
            this._fnHashMap[node.subscription.id].forEach((node) => {
                if (node.subscription.fn === fn) {
                    // TODO: Think about this problem a bit..
                    //
                    // The scenario here is something like this..
                    //
                    // function handler() { this.doSomething(); }
                    // function Foo () { return { doSomething: function() {...} } }
                    // Foo.prototype.handler = handler;
                    // function Bar () { return { doSomething: function() {...} } }
                    // Bar.prototype.handler = handler;
                    // var b = new Bar();
                    // var f = new Foo();
                    // pubsub.subscribe("thing", f.handler, {}, f);
                    // pubsub.subscribe("thing", b.handler, {}, b);
                    //
                    // There's probably other scenarios here too.
                    // Unless the unsubscribe also gets the original context
                    // which the function is applied to, then we could add
                    // additional checks.
                    throw new Error(`Function ${node.subscription} has already been passed as a subscriber to <${this.namespace}>; will not be able to safely remove.`);
                }
            });
        }
        this._fnHashMap[node.subscription.id].push(node);

        if (this._priorityMatrix[priority]) {
            last = this._priorityMatrix[priority]!;
            while (last.next) {
                last = last.next;
            }
            last.next = node;
            node.prev = last;
        } else {
            this._priorityMatrix[priority] = node;
        }
    }

    public unsubscribe(fn: Function): boolean {
        // TODO: We could optimize a little here, since we sometimes hash a
        // function twice, we could allow this to be called with a node also,
        // which has already had it's function hashed.
        let id: string = Subscription.hashFn(fn);;
        let fnArray: Array<DLLNode> | null = null;
        let node: DLLNode | null = null;
        let idx: number = 0;
        let didEvictDLLNode: boolean = false;
        if (!hasOwnProperty.call(this._fnHashMap, id)) {
            return didEvictDLLNode;
        }
        fnArray = this._fnHashMap[id];
        for (; idx < fnArray.length; idx++) {
            node = fnArray[idx];
            if (node.subscription.fn !== fn) {
                continue;
            }
            if (this._callingNode === node && !(this._commandMask & this.SIG_INT)) {
                // NOTE(estobbart): You can't remove the calling node, because it
                // will lose it's assignments next & prev, which causes the publish
                // to stop calling.
                // Theres an issue when trying to just remove it on a setTimeout,
                // if the same channel was published inside of a publish handler
                // that was attempting to be removed.
                //
                // This would be bad, subscriberFn would get us into an infinite
                // loop..
                // function subscriberFn () {
                //    pubsub.unsubscribe("foo", subscriberFn);
                //    pubsub.publish("foo");
                // }
                // pubsub.subscribe("foo", subscriberFn);
                // pubsub.publish("foo");
                // So we also set the publishing flag of the channel, so that
                // the scenario above is properly handled.
                setTimeout(this.unsubscribe.bind(this), 0, node.subscription.fn);
                break;
            }
            // node is the head if no prev
            if (!node.prev) {
                // if it's not the last, then make sure to remove the reference
                // back to the one being removed
                if (node.next) {
                    node.next.prev = null;
                }
                this._priorityMatrix[node.priority] = node.next || undefined;
                node.next = null;
            } else {
                // Could be in the middle or the last
                node.prev.next = node.next;
                if (node.next) {
                    node.next.prev = node.prev;
                    node.next = null;
                }
                node.prev = null;
            }
            didEvictDLLNode = true;
            break;
        }
        // We only modify the array after breaking out of the loop, chances are
        // the array is short unless it's from an Observable, in which case all
        // the functions hash out the same and get put into the array at
        // priority 4.
        if (didEvictDLLNode) {
            if (fnArray.length <= 1) {
                delete this._fnHashMap[id];
            } else {
                fnArray.splice(idx, 1);
            }
        }
        return didEvictDLLNode;
    }
}

Channel.prototype.CLEAR_BITS = 0x00;
Channel.prototype.SIG_INT = 0x01;
Channel.prototype.PUBLISHING = 0x02;

// Mediator backwards compatibility
Channel.prototype.stopPropagation = Channel.prototype.interrupt;


export interface SubResposne {
    channel: MediatorChannel;
    fn: Function;
}

export interface SubPriority {
    priority?: number;
}

export class PubSub {

    private _channels: { [x: string]: Channel } = Object.create(null);

    constructor() {
        if (!(this instanceof PubSub)) {
            return new PubSub();
        }
    }

    // Mediator backwards compatibility
    public off: Function;
    public remove: Function;
    public on: Function;
    public bind: Function;
    public emit: Function;
    public trigger: Function;

    // TODO: Be nice to be able to do something like fn: (...args, channel: Channel): void
    public subscribe(channelName: string, fn: Function, priority: SubPriority, context: Object): SubResposne {
        let suggestedPriority: number;
        if (!hasOwnProperty.call(this._channels, channelName)) {
            this._channels[channelName] = new Channel(channelName);
        }
        // TODO: Which parts of this check will TypeScript do for me..
        suggestedPriority = priority && typeof priority.priority === "number" ? priority.priority : 4;
        this._channels[channelName].subscribe(fn, Math.max(0, Math.min(suggestedPriority, 4)), context);

        // Mediator backwards compatibility
        // Mediator-js returns the subscriber here which has a channel property
        // which you can then get the namespace from, and the original function passed in.
        return {
            channel: this._channels[channelName],
            fn: fn
        };
    }

    public unsubscribe(channelName: string, fn: Function): boolean {
        // TODO: Mediator has this way of unsubscribing to everything in a channel
        let didUnsubscribe = false;
        if (hasOwnProperty.call(this._channels, channelName) && typeof fn === "function") {
            // TODO(estobb200): Memory leak here, see issue # 4
            didUnsubscribe = this._channels[channelName].unsubscribe(fn);
            if (didUnsubscribe && !this._channels[channelName].hasSubscribers()) {
                delete this._channels[channelName];
            }
        }
        return didUnsubscribe;
    }

    public publish(channelName: string, ...args: any[]): void;

    public publish(channelName: string): void {
        if (hasOwnProperty.call(this._channels, channelName)) {
            let args: Array<any> = Array.prototype.slice.call(arguments, 1);
            this._channels[channelName].publish(args);
        }
    }
}

// Mediator backwards compatibility
PubSub.prototype.off = PubSub.prototype.unsubscribe;
PubSub.prototype.remove = PubSub.prototype.unsubscribe;
PubSub.prototype.on = PubSub.prototype.subscribe;
PubSub.prototype.bind = PubSub.prototype.subscribe;
PubSub.prototype.emit = PubSub.prototype.publish;
PubSub.prototype.trigger = PubSub.prototype.publish;
