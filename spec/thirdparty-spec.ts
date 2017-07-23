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

import { PubSub } from '../src/publicious';
import { Observable }from "rxjs/Observable"
import "rxjs/add/observable/fromEventPattern";
import "rxjs/add/operator/do";
import "rxjs/add/operator/take";
import "rxjs/add/operator/withLatestFrom";
import { expect } from 'chai';

describe("Third Party Support", () => {

    let pubsub: PubSub;

    beforeEach(() => {
        pubsub = new PubSub();
    });

    describe('RxJS', () => {

        function toObservable<T>(pubsub: PubSub, name: string): Observable<T> {
            return Observable.fromEventPattern<T>(
                (handler) => pubsub.subscribe(name, handler, {}, {}),
                (handler) => pubsub.remove(name, handler)
            );
        }

        it('should subsubscribe', () => {
            let arg: string = "payload";
            toObservable<string>(pubsub, "foo")
              .take(1)
              .subscribe((result: string) => {
                  expect(arg).to.equal(result);
              });
            pubsub.publish("foo", arg);
        });

        it('should allow multiple subscribers', () => {
            let arg: string = "payload";
            toObservable<string>(pubsub, "foo")
              .withLatestFrom(toObservable<string>(pubsub, "bar"),
                              (foo, bar) => {
                  return foo + bar;
              })
              .take(1)
              .subscribe((result: string) => {
                expect(arg + arg).to.equal(result);
              });
            // This is interesting.. flipping the order of these publish calls
            // causes the test to fail.
            pubsub.publish("bar", arg);
            pubsub.publish("foo", arg);
        });

        it('should receive error', done => {
            let arg: string = "payload";
            toObservable<string>(pubsub, "foo")
              .withLatestFrom(toObservable<string>(pubsub, "bar")
                                .do(() => {
                                    throw new Error("Error in subscribe chain");
                                }),
                              (_foo, _bar) => {
                  return "Error handling failure";
              })
              .take(1)
              .subscribe((result: string) => done(result),
                  (_err) => {
                      done();
                  });
            pubsub.publish("bar", arg);
            pubsub.publish("foo", arg);
        });

        it('publish should not throw if no RxJS error handler', () => {
            let arg: string = "payload";
            toObservable<string>(pubsub, "foo")
              .withLatestFrom(toObservable<string>(pubsub, "bar")
                                .do(() => {
                                    throw new Error("Error in subscribe chain");
                                }),
                              (_foo, _bar) => {
                  return "Error handling failure";
              })
              .take(1)
              .subscribe((_: string) => undefined);
            expect(pubsub.publish("bar", arg)).to.not.throw;
            expect(pubsub.publish("foo", arg)).to.not.throw;
        });

    });
});
