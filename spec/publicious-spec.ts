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

import { PubSub, MediatorChannel } from '../src/publicious';
import { expect, AssertionError } from 'chai';
import * as sinon from 'sinon';

describe('PubSub', () => {

    let pubsub: PubSub;

    beforeEach(() => {
        pubsub = new PubSub();
    });

    it('should subsubscribe, compatibility', () => {
        expect(pubsub.subscribe('foo', () => undefined, {}, {})).to.not.throw;
        expect(pubsub.on('foo', () => undefined, {}, {})).to.not.throw;
        expect(pubsub.bind('foo', () => undefined, {}, {})).to.not.throw;
    });

    it('should unsubsubscribe, compatibility', () => {
        let handler = () => undefined;
        expect(pubsub.subscribe('foo', handler, {}, {})).to.not.throw;
        expect(pubsub.unsubscribe('foo', handler)).to.be.true;

        expect(pubsub.subscribe('foo', handler, {}, {})).to.not.throw;
        expect(pubsub.off('foo', handler)).to.be.true;

        expect(pubsub.subscribe('foo', handler, {}, {})).to.not.throw;
        expect(pubsub.remove('foo', handler)).to.be.true;
    });

    it('should publish, compatibility', () => {
        let spy = sinon.spy();
        pubsub.subscribe('foo', spy, {}, {});
        expect(pubsub.publish('foo')).to.not.throw;

        expect(spy.calledOnce).to.be.true;
        // TODO: Check emit & trigger
    });

    it.skip('should publish with args, compatibility', () => {
        // let spy = sinon.spy();
        // let args = [6, 6, 6, "The number of the beast"];
        // expect(pubsub.publish('foo', args[0], args[1], args[2], args[3])).to.not.throw;
        //
        // expect(spy.calledOnce).to.be.true;
        // expect(spy.calledWith(args[0], args[1], args[2], args[3])).to.be.true;
    });

    it('should allow unsubscribing during the publish', done => {
        let handlerSpy = sinon.spy();
        let handler = () => {
            // Confirms the unsubscribe happens during a callback
            expect(pubsub.unsubscribe('foo', handler)).to.be.false;
        }
        pubsub.subscribe('foo', handler, {}, {});
        pubsub.subscribe('foo', handlerSpy, {}, {});
        pubsub.publish('foo');
        setTimeout(() => {
            // Confirms that remaining nodes still are executed
            expect(handlerSpy.calledOnce).to.be.true;
            done();
        }, 0);
    });

    it('should allow unsubscribing during the publish & republish', done => {
        let handler = () => {
            // Confirms the unsubscribe happens during a callback &
            // that the publish also happens on a callback so that
            // we don't get in an infite loop.
            expect(pubsub.unsubscribe('foo', handler)).to.be.false;
            pubsub.publish('foo');
            done();
        }
        pubsub.subscribe('foo', handler, {}, {});
        pubsub.publish('foo');
    });

     // TODO:
    it.skip('should allow prev nodes to unsubscribe during the publish', done => {
        let handlerSpy = sinon.spy();
        let handler = () => {
            // Confirms prev nodes can be removed and everyone still gets
            // called correctly
            expect(pubsub.unsubscribe('foo', handlerSpy)).to.be.true;
        }
        pubsub.subscribe('foo', handlerSpy, {}, {});
        pubsub.subscribe('foo', handler, {}, {});
        pubsub.publish('foo');
        setTimeout(() => {
            // Confirms that remaining nodes are not executed
            expect(handlerSpy.calledOnce).to.be.true;
            done();
        }, 0);
    });

    it('should allow late subscribers during the publish', () => {
        let handlerSpy = sinon.spy();
        let handler = () => {
            pubsub.subscribe('foo', handlerSpy, {}, {});
        }
        pubsub.subscribe('foo', handler, {}, {});
        pubsub.publish('foo');
        expect(handlerSpy.calledOnce).to.be.true;
    });

    it('should remove the correct amount of subscribers', () => {
        let handlerSpyOne = sinon.spy();
        let handlerSpyTwo = sinon.spy();
        let handlerSpyThree = sinon.spy();
        pubsub.subscribe('foo', handlerSpyOne, {}, {});
        pubsub.subscribe('foo', handlerSpyTwo, {}, {});
        pubsub.subscribe('foo', handlerSpyThree, {}, {});
        pubsub.remove('foo', handlerSpyTwo);
        pubsub.publish('foo');
        expect(handlerSpyOne.called).to.be.true;
        expect(handlerSpyTwo.called).to.be.false;
        expect(handlerSpyThree.called).to.be.true;
        expect(pubsub.remove('foo', handlerSpyThree)).to.be.true;
    });

    it('should allow immediate unsubscribing/resubscribing from an interrupted channel', done => {
        // See inner comment when this fails due to a timeout
        function handler(_: any, channel: MediatorChannel) {
            channel.stopPropagation();
            pubsub.unsubscribe("foo", handler);
            expect(() => { pubsub.subscribe("foo", handler, {}, {}); }).to.not.throw(Error);
            // if we don't reach this done function, that means the expect
            // threw an assertion, and publicious caught it.
            done();
        }
        pubsub.subscribe("foo", handler, {}, {});
        pubsub.publish("foo", []);
    });

    it('should not throw by default', () => {
        pubsub.subscribe("foo", () => { throw new Error(); }, {}, {});
        pubsub.publish("foo");
    });

    it('should throw with global flag set', () => {
        let ps2 = new PubSub({ suppressErrors: false });
        ps2.subscribe("foo", () => { throw new Error(); }, {}, {});
        return new Promise((resolve, reject) => {
            try {
                ps2.publish("foo");
                reject(new Error("test failed due to suppressing an error with flag set to false"));
            } catch(e) {
                resolve();
            }
        });
    });

    it.only('should throw with publish suppress flag set', () => {
        let pubsub = new PubSub({ suppressErrors: false });
        pubsub.subscribe("foo", () => { throw new Error(); }, {}, {});
        return new Promise((resolve,reject)) => {
        try {
            pubsub.publish("foo", { suppressErrors: false });
            reject(new Error("test failed due to suppressing an error with flag set to false"));
            } catch(e) {
            resolve();
            }
       });
    });

    it('should not receive publish arg in subscriber', done => {
        pubsub.subscribe("foo", (arg: any) => {
            expect(arg).to.not.have.property('suppressErrors');
            throw new Error("Intentionally thrown error that should not be suppressed");
        }, {}, {});
        try {
            pubsub.publish("foo", { suppressErrors: false });
            done(new Error("Test failed to recognize setting, thrown error was suppressed"));
        } catch(e) {
            if (e instanceof AssertionError) {
                // Test failed due to chai expect
                return done(e);
            }
            // test passed due to not suppressing an error
            done();
        }
    });

    it('should allow local overrides of the global setting to suppress', done => {
        var ps2 = new PubSub({ suppressErrors: false });

        ps2.subscribe("foo", () => {
            throw new Error("Error should not be seen due to being suppressed");
        }, {}, {});

        try {
            ps2.publish("foo", { suppressErrors: true });
            done();
        } catch(e) {
            done(e);
        }
    });

        it("should fail", () => {
        return new Promise((resolve) => {
            resolve();
        });
    });


    it('should throw if subscriber function is added twice', done => {
        pubsub.subscribe("foo", JSON.stringify);
        try {
            pubsub.subscribe("foo", JSON.stringify);
            done(new Error("Subscribe should've thrown"));
        } catch(e) {
            done();
        }
    });



});
