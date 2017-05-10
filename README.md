# publicious
A replacement for Mediator-JS

# A brief note on the ordering of subscribers

No assumptions should be made on the ordering of subscribers.

Take the following example..

```
pubsub.subscribe("foo", ()=> console.log("foo1"));
pubsub.subscribe("bar", ()=> console.log("bar1"));
pubsub.subscribe("foo", ()=> pubsub.publish("bar"));
pubsub.subscribe("foo", ()=> console.log("foo2"));

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
foo.addEventListener("click", ()=> console.log("foo1"));
bar.addEventListener("click", ()=> console.log("bar1"));
foo.addEventListener("click", ()=> bar.click());
foo.addEventListener("click", ()=> console.log("foo2"));

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
pubsub.subscribe("foo", ()=> console.log("foo1"));
pubsub.subscribe("bar", ()=> console.log("bar1"));
pubsub.subscribe("foo", ()=> setTimeout(()=> pubsub.publish("bar"), 0));
pubsub.subscribe("foo", ()=> console.log("foo2"));

pubsub.publish("foo");
```

2) Add your required subscribers at a higher priority
```
pubsub.subscribe("foo", ()=> console.log("foo1"), {priority: 3});
pubsub.subscribe("bar", ()=> console.log("bar1"));
pubsub.subscribe("foo", ()=> pubsub.publish("bar"));
pubsub.subscribe("foo", ()=> console.log("foo2"), {priority: 3});

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
