var React = require('react');
var merge = require('react/lib/merge');
var Mousetrap = require('mousetrap');
var csp = require('js-csp');
var chan = csp.chan;
var go = csp.go;
var put = csp.put;
var take = csp.take;
var timeout = csp.timeout;
var alts = csp.alts;

require('./style.css');

function bindKey(key, ch) {
  ch = ch || chan();
  Mousetrap.bind(key, function() {
    csp.putAsync(ch, key);
  });
  return ch;
}

function tickChan() {
  var ch = chan(csp.buffers.sliding(1));
  var t = 0;
  go(function*() {
    while(yield put(ch, t)) {
      t =  t + 1;
      yield take(timeout(33));
    }
  });
  return ch;
}

function groundChan() {
  var ch = chan();
  var tickCh = tickChan();
  go(function*() {
    var t;
    var open = true;
    while((t = yield take(tickCh)) !== csp.CLOSED) {
      open = yield put(ch, {
        id: 'ground',
        baseX: -128,
        x: ((t % 64) * -8), y: 384
      });
      if (!open) {
        tickCh.close();
      }
    }
  });
  return ch;
}

function spaceChan() {
  var ch = chan();
  var tickCh = tickChan();
  // This doesn't seem to work, I'm still getting key events after the tick
  var keyCh = bindKey('space', chan(csp.buffers.dropping(0)));
  go(function*() {
    var t;
    var key;
    var open = true;
    while(open) {
      // NOTE: trying to throttle key presses by tick,
      // have no idea what I'm doing :)
      key = yield take(keyCh);
      t = yield take(tickCh);
      open = yield put(ch, key);
      if (!open) {
        keyCh.close();
        tickCh.close();
      }
    }
  });
  return ch;
}

function velocity(node) {
  return merge(node, {
    x: node.x + node.vx,
    y: node.y + node.vy
  });
}

function pinkieChan() {
  var ch = chan();
  var tickCh = tickChan();
  var spaceCh = spaceChan();
  go(function*() {
    var initialPinkie = {
      id: 'pinkie',
      baseY: 276,
      x: 0, y: 0,
      vx: 0, vy: 0
    };
    var p = initialPinkie;
    var open = true;
    while(open) {
      var v = yield alts([tickCh, spaceCh]);

      if (v.channel === tickCh) {
        p = velocity(p);

        // Apply gravity to Pinkie's velocity.
        p.vy += 0.98;

        // AS Pinkie Pie,
        // GIVEN that I'm falling
        // WHEN I hit the ground
        // THEN I stop.
        if (p.y >= 0 && p.vy > 0) {
          p.y = 0; p.vy = 0;
        }

        p.id = (p.y < 0) ? 'pinkie jumping' : 'pinkie';

        open = yield put(ch, p);
      }

      else if (v.channel === spaceCh) {
        // If Pinkie is on the ground and space has been pressed, JUMP.
        if (p.y === 0) {
          p.vy = -20;
          new Audio(require('./sfx/jump.mp3')).play();
        }
      }

      if (!open) {
        spaceCh.close();
        tickCh.close();
      }
    }
  });
  return ch;
}

function makeElement(node) {
  return React.DOM.div({
    key: node.id,
    className: node.id,
    style: {
      left: (node.x + (node.baseX || 0)) + 'px',
      top: (node.y + (node.baseY || 0)) + 'px'
    }
  });
}

function renderScene(state) {
  var keys = Object.keys(state);
  var nodes = keys.map(function(k) {
    return makeElement(state[k]);
  });
  return React.renderComponent(
    React.DOM.div({className: 'canvas'}, nodes),
    document.body
  );
}

function main() {
  var groundCh = groundChan();
  var pinkieCh = pinkieChan();
  var timeoutCh = timeout(100000);
  go(function*() {
    var stop = false;
    var state = {};
    while(!stop) {
      var v = yield alts([timeoutCh, groundCh, pinkieCh]);
      if (v.channel === timeoutCh) {
        pinkieCh.close();
        groundCh.close();
        stop = true;
      }
      else {
        if (v.channel === groundCh) {
          state.ground = v.value;
        }
        else if (v.channel === pinkieCh) {
          state.pinkie = v.value;
        }
        renderScene(state);
      }
    }
  });
}

main();
