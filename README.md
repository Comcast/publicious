# publicious
A replacement for Mediator-JS

# API

Basic usage..

```
let pubsub = new PubSub();

pubsub.subscribe("foo", () => console.log("Hello World"));
pubsub.publish("foo");

```

Here the pubsub instance subscribed to the `foo` channel, then published on
the foo channel.

## Arguments

### Subscribe

`subscribe` actually accepts 4 args. The `channel` you're subscribing to, the
`Function` to be called, the priority at which you're subscribing, and the `this`
context to be applied to the function. The last two arguments are optional.

A more complete example of subscribe would look like this..

```
function Counter() {
    this.value = 0;
}

Counter.prototype.increment = function() {
    return ++this.value;
}

let fooCount = new Counter();

let pubsub = new PubSub();

pubsub.subscribe("foo", () => console.log("Count:" + fooCount.value));

pubsub.subscribe("foo", fooCount.increment, {priority: 0}, fooCount);
pubsub.publish("foo");

```

In the above example we introduced two concepts, first is priority.
Even though the subscriber that prints subscribes before the subscriber that
increments, they are called in priority order. The default priority is 4, which
is the lowest that can be assigned. Additional notes about priority and ordering
subscribers is below.

This example also introduces the context argument which is the `this` argument
that gets applied to the function when it gets called.


## Thrown errors and interrupting subscribers

By default, a channel will not interrupt subscribers due to any subscriber
throwing an error. It instead will throw the error after all subscribers are
called.

```
var pubsub = new PubSub();

pubsub.subscribe("foo", () => throw new Error());
pubsub.subscribe("foo", () => console.log("Hello World"));
```

This allows subscribers to not have to worry about other subscribers getting
in the way accidentally. If a subscriber NEEDS to interrupt other subscribers,
it should do so intentionally, by calling `stopPropagation` on the channel.
The channel will be the last argument that is passed to the subscriber.

```
var pubsub = new PubSub();

pubsub.subscribe("foo", function() {
    var channel = arguments[arguments.length - 1];
    channel.stopPropagation();    
});
pubsub.subscribe("foo", () => console.log("Hello World")); // subscriber function argument not called
pubsub.publish("foo");
```

In the example above `Hello World` will not print due to the first subscriber
interrupting the channel prior to the second subscriber being called.

If the publisher of the channel wants to know that the error occurred, it needs
to set the suppressErrors flag either globally on the pubsub instance, or on each
individual publish call.


Globally set for all publish calls:

```
var pubsub = new PubSub({ suppressErrors: false });

pubsub.subscribe("foo", () => throw new Error());

try {
    pubsub.publish("foo");
} catch (e) {
    console.log("error not suppressed");
}
```

Per single publish call:

```
var pubsub = new PubSub();

pubsub.subscribe("foo", () => throw new Error());

try {
    pubsub.publish("foo", { suppressErrors: false });
} catch (e) {
    console.log("error not suppressed");
}

pubsub.publish("foo");
console.log("code not reached, error was thrown");

```

You can also use this method above to reverse the global setting

```
var pubsub = new PubSub({ suppressErrors: false });

pubsub.subscribe("foo", () => throw new Error());

pubsub.publish("foo", { suppressErrors: true });
console.log("code was reached & error was thrown");

```

This is commonly used in testing purposes where a test may throw
an `AssertionError` or something similar, and the outer test function needs to
catch that error to know if the test failed.


#Passed arguments
You can publish any number of args and each subscriber will receive them

```
var pubsub = new PubSub();

pubsub.subscribe("foo", (n, b, s, o, a) => console.log(n, b, s, o, a));
pubsub.publish("foo", 1, false, "test", {}, ["apples", "oranges"]);
```

If you're using the suppress feature described above, that argument is removed
before reaching the subscribers, and as always the channel will be added as the
last argument.

```
var pubsub = new PubSub();

pubsub.subscribe("foo", (n, b, s, o, a, channel) => console.log(n, b, s, o, a, channel.namespace));
pubsub.publish("foo", 1, false, "test", {}, ["apples", "oranges"], { suppressErrors: false });
```


# Sync or Async?

All publishing happens synchronously, with one exception.
If a channel is already being published and a second publish is requested on
the same channel.

Even though this is supported, it's discouraged.
In future versions an error may be thrown instead.

```
var pubsub = new PubSub();

pubsub.subscribe("foo", () => pubsub.publish("foo")); // this inner publish happens asynchronously
pubsub.publish("foo"); // this publish happens synchronously
```

If you need errors, and you also need to re-publish a channel during it's current
publish (forcing it to be async), we then return a Promise, so that the errors
can be handled in the Promise's catch.

```
var pubsub = new PubSub();

pubsub.subscribe("foo", () => {
    pubsub.publish("foo", { suppressErrors: false }).catch(() => {
        console.log("caught error in async publish");
    });
});
pubsub.subscribe("foo", () => throw new Error());
pubsub.publish("foo");
```


# Ordering of subscribers
No assumptions should be made on the ordering of subscribers.

Take the following example..

```
pubsub.subscribe("foo", () => console.log("foo1"));
pubsub.subscribe("bar", () => console.log("bar1"));
pubsub.subscribe("foo", () => pubsub.publish("bar"));
pubsub.subscribe("foo", () => console.log("foo2"));

pubsub.publish("foo");
```

It could be assumed that you'd get..

```
foo1
foo2
bar1
```

Instead what happens is..

```
foo1
bar1
foo2
```

This behavior may be slightly unexpected, but it is by design.
This is inline with how the DOM works also.
Replace the above example with the following using the DOM.

```
let foo = document.createElement("a");
let bar = document.createElement("a");
foo.addEventListener("click", () => console.log("foo1"));
bar.addEventListener("click", () => console.log("bar1"));
foo.addEventListener("click", () => bar.click());
foo.addEventListener("click", () => console.log("foo2"));

foo.click();
```

Same as above, you'd get..

```
foo1
bar1
foo2
```

There are a few fixes to this problem that you can use as the client.
Pick your poison..

1) Wrap your publish in a setTimeout
```
pubsub.subscribe("foo", () => console.log("foo1"));
pubsub.subscribe("bar", () => console.log("bar1"));
pubsub.subscribe("foo", () => setTimeout(() => pubsub.publish("bar"), 0));
pubsub.subscribe("foo", () => console.log("foo2"));

pubsub.publish("foo");
```

2) Add your required subscribers at a higher priority
```
pubsub.subscribe("foo", () => console.log("foo1"), {priority: 3});
pubsub.subscribe("bar", () => console.log("bar1"));
pubsub.subscribe("foo", () => pubsub.publish("bar"));
pubsub.subscribe("foo", () => console.log("foo2"), {priority: 3});

pubsub.publish("foo");
```

3) Swap out PubSub's prototype publish to setTimeout if currently publishing
```
PubSub.prototype.publishing = false;
PubSub.prototype.publish = () => {
    if (this.publishing) {
        setTimeout((argsCopy) => {
            this.publish.apply(this, argsCopy);
        }, 0, arguments);
        return;
    }
    this.prototype.publishing = true;
    this._channels[channelName].publish.apply(arguments);
    this.prototype.publishing = false;
}
```
