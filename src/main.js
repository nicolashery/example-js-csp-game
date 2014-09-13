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

function onscreen(node) {
  return !(node.x < -300 || node.y < -1000 || node.y > 1000);
}

function bounds(node) {
  var b = { x1: node.offsetLeft, y1: node.offsetTop };
  b.x2 = b.x1 + node.offsetWidth;
  b.y2 = b.y1 + node.offsetHeight;
  // Add some tolerance, because Pinkie sprite is very wide.
  b.x1 += 32; b.x2 -= 32;
  return b;
}

function intersectsWith(me, target) {
  var b1 = bounds(me), b2 = bounds(target);
  return !(b2.x1 > b1.x2 || b2.x2 < b1.x1 ||
           b2.y1 > b1.y2 || b2.y2 < b1.y1);
}

function intersects(me, target) {
  me = document.body.querySelectorAll('.' + me)[0];
  target = document.body.querySelectorAll('.' + target)[0];
  if (!(me && target)) {
    return false;
  }
  return intersectsWith(me, target);
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

function coinChan() {
  var ch = chan();
  var tickCh = tickChan();
  go(function*() {
    var initialCoin = {
      id: 'coin',
      x: 1600, y: 40,
      vx: -6, vy: 0
    };
    var c = initialCoin;
    var p;
    var open = true;
    while(open) {
      yield take(tickCh);
      c = velocity(c);

      // If coin is going upwards, go faster and faster
      if (c.vy < 0) {
        c.vy = c.vy *2;
      }

      // If Pinkie touches the coin, ding it!
      if (c.vy === 0 && intersects('coin', 'pinkie')) {
        new Audio(require('./sfx/coin.mp3')).play();
        c.vx = 0; c.vy = -1;
      }

      // If coin is offscreen, reset it
      c = onscreen(c) ? c : initialCoin;

      open = yield put(ch, c);

      if (!open) {
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
  var coinCh = coinChan();
  var timeoutCh = timeout(100000);
  go(function*() {
    var stop = false;
    var state = {};
    while(!stop) {
      var v = yield alts([timeoutCh, groundCh, pinkieCh, coinCh]);
      if (v.channel === timeoutCh) {
        coinCh.close();
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
        else if (v.channel === coinCh) {
          state.coin = v.value;
        }
        renderScene(state);
      }
    }
  });
}

main();
