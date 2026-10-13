/* Design illustration: Grow -> Serve -> Improve. Randomized dots illustrate requests, results and a repair path; they are not live operating data. */
(function () {
  'use strict';
  var LIME = 0xB9E46B, ORANGE = 0xF4A259, SOFT = 0xB7C1BA, DIM = 0x56616B, WHITE = 0xEEF2EA;

  function glowTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(c); return t;
  }

  function init(stage) {
    if (!window.THREE) { stage.classList.add('no3d'); return; }
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) { stage.classList.add('no3d'); return; }
    var ready = false;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var compact = stage.hasAttribute('data-compact');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    stage.insertBefore(renderer.domElement, stage.firstChild);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    var group = new THREE.Group(); scene.add(group);
    var TILT = 0.95; // radians: rings lie back like plates on a table
    var tex = glowTexture();
    // a faint floor and fog give depth; the fog colour matches the page behind the stage
    var bgEl = stage, bg = 'rgb(15, 19, 24)';
    while (bgEl && bgEl !== document.documentElement) { var c = getComputedStyle(bgEl).backgroundColor; if (c && c !== 'transparent' && c.indexOf('rgba(0, 0, 0, 0)') !== 0) { bg = c; break; } bgEl = bgEl.parentElement; }
    scene.fog = new THREE.Fog(new THREE.Color(bg), 6, 17);
    var floor = new THREE.GridHelper(26, 26, 0x2A333D, 0x1F262E); floor.position.y = -1.55; floor.material.transparent = true; floor.material.opacity = 0.55; scene.add(floor);

    var rings = [
      { key: 'grow', name: 'Grow', cx: -3.2, R: 1.05, color: SOFT, tip: 'Grow: invite the next user, then measure whether the invitation works.', href: stage.getAttribute('data-href-grow') },
      { key: 'serve', name: 'Serve', cx: 0, R: 1.5, color: LIME, tip: 'Serve: order, make, check and deliver within the limits you set.', href: stage.getAttribute('data-href-serve') },
      { key: 'improve', name: 'Improve', cx: 3.2, R: 1.05, color: SOFT, tip: 'Improve: test a change from feedback. Keep it only if the comparison is better.', href: stage.getAttribute('data-href-improve') }
    ];
    function ringPoint(ring, a, out) {
      out = out || new THREE.Vector3();
      var x = ring.R * Math.cos(a), y = ring.R * Math.sin(a);
      return out.set(ring.cx + x, y * Math.cos(TILT), -y * Math.sin(TILT));
    }

    rings.forEach(function (ring) {
      var geo = new THREE.TorusGeometry(ring.R, ring.key === 'serve' ? 0.05 : 0.035, 16, 180);
      var mat = new THREE.MeshBasicMaterial({ color: ring.color, transparent: true, opacity: ring.key === 'serve' ? 1 : 0.75 });
      var mesh = new THREE.Mesh(geo, mat);
      // ringPoint maps (x, y) -> (x, y cos T, -y sin T): a rotation about X by -TILT
      mesh.position.set(ring.cx, 0, 0); mesh.rotation.x = -TILT;
      group.add(mesh); ring.mesh = mesh; ring.mat = mat;
      var halo = new THREE.Mesh(new THREE.TorusGeometry(ring.R, 0.16, 12, 120), new THREE.MeshBasicMaterial({ color: ring.color, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.copy(mesh.position); halo.rotation.x = -TILT; group.add(halo); ring.halo = halo;
      var hit = new THREE.Mesh(new THREE.TorusGeometry(ring.R, 0.32, 8, 60), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.copy(mesh.position); hit.rotation.x = -TILT; hit.userData.ring = ring; group.add(hit); ring.hit = hit;
    });
    var serve = rings[1], grow = rings[0], improve = rings[2];

    // stations on the Serve ring (dots move with decreasing angle = clockwise on screen)
    var stations = [
      { name: 'Order', a: 2.55 }, { name: 'Make', a: 0.95 }, { name: 'Check', a: -0.3 }, { name: 'Deliver', a: -1.25 }
    ];
    stations.forEach(function (s) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: s.name === 'Check' ? ORANGE : WHITE }));
      ringPoint(serve, s.a, m.position); group.add(m); s.mesh = m;
    });

    // fixed arrows that say how the loops feed each other (readable even in a still frame)
    var LINK = 0x8C9A93;
    function bezierPts(a, b, lift) {
      var mid = a.clone().add(b).multiplyScalar(0.5); mid.y += lift; mid.z += lift * 0.35;
      return new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    }
    var links = [
      { a: ringPoint(grow, 0.6), b: ringPoint(serve, stations[0].a), lift: 0.7, text: 'new customers', at: 0.45, dy: 0.38 },
      { a: ringPoint(serve, stations[3].a), b: ringPoint(improve, Math.PI + 0.5), lift: -0.5, text: 'results + ratings', at: 0.5, dy: -0.32 },
      { a: ringPoint(improve, 2.2), b: ringPoint(serve, stations[1].a), lift: 0.8, text: 'keep only if better', at: 0.42, dy: 0.38 }
    ];
    links.forEach(function (l) {
      l.curve = bezierPts(l.a, l.b, l.lift);
      var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(l.curve.getPoints(48)),
        new THREE.LineDashedMaterial({ color: LINK, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.9 }));
      line.computeLineDistances(); group.add(line);
      var head = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.22, 12), new THREE.MeshBasicMaterial({ color: LINK }));
      head.position.copy(l.curve.getPoint(0.97));
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), l.curve.getTangent(0.97).normalize());
      group.add(head);
    });

    // HTML tags
    var tags = [];
    function addTag(text, cls, getPos) { var el = document.createElement('div'); el.className = 'tag ' + cls; el.textContent = text; el.style.visibility = 'hidden'; stage.appendChild(el); tags.push({ el: el, pos: getPos }); }
    rings.forEach(function (ring) { addTag(ring.name, 'big' + (ring.key === 'serve' ? ' serve' : ''), function () { return new THREE.Vector3(ring.cx, 0, 0); }); });
    if (!compact) stations.forEach(function (s) { addTag(s.name, 'small', function () { var p = ringPoint(serve, s.a); var dir = p.clone().sub(new THREE.Vector3(serve.cx, 0, 0)).normalize(); return p.add(dir.multiplyScalar(0.6)); }); });
    links.forEach(function (l) { addTag(l.text, 'link', function () { var p = l.curve.getPoint(l.at); p.y += l.dy; return p; }); });
    var tip = document.createElement('div'); tip.className = 'tip'; stage.appendChild(tip);
    var defaultTip = 'Illustration: dots are requests. Orange shows a repair path; a real loop can also stop or ask a person.';
    tip.textContent = defaultTip;

    // particles
    var dots = [];
    function makeDot(color, size) {
      var g = new THREE.Group();
      var core = new THREE.Mesh(new THREE.SphereGeometry(size || 0.07, 12, 10), new THREE.MeshBasicMaterial({ color: color }));
      var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      spr.scale.set(0.55, 0.55, 0.55); g.add(core); g.add(spr); group.add(g);
      return { obj: g, core: core, spr: spr, setColor: function (c) { core.material.color.setHex(c); spr.material.color.setHex(c); } };
    }
    function bezier(a, b, lift) {
      var mid = a.clone().add(b).multiplyScalar(0.5); mid.y += lift; mid.z += lift * 0.35;
      return new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    }
    function spawnCustomer() {
      if (dots.length > 26) return;
      var d = makeDot(WHITE, 0.06); d.state = 'grow'; d.a = 0.6 + 0.4 + Math.random() * Math.PI * 1.6; d.speed = 1.3; // leaves Grow where the arrow starts
      dots.push(d);
    }
    function toFly(d, curve, dur, next, color) { d.state = 'fly'; d.curve = curve; d.t = 0; d.dur = dur; d.next = next; if (color) d.setColor(color); }
    var tmp = new THREE.Vector3();
    function stepDot(d, dt) {
      if (d.state === 'grow') {
        d.a -= d.speed * dt; ringPoint(grow, d.a, d.obj.position);
        if (d.a <= 0.6) {
          var from = ringPoint(grow, 0.6), to = ringPoint(serve, stations[0].a);
          toFly(d, bezier(from, to, 0.7), 0.9, function () { d.state = 'serve'; d.a = stations[0].a; d.speed = 0.85; d.setColor(LIME); d.checked = false; });
        }
      } else if (d.state === 'serve') {
        var before = d.a; d.a -= d.speed * dt; ringPoint(serve, d.a, d.obj.position);
        var check = stations[2].a, deliver = stations[3].a;
        if (!d.checked && before > check && d.a <= check) {
          d.checked = true;
          if (Math.random() < 0.22) { // failed check: back to Make
            var p1 = ringPoint(serve, check), p2 = ringPoint(serve, stations[1].a);
            toFly(d, bezier(p1, p2, -0.9), 1.0, function () { d.state = 'serve'; d.a = stations[1].a; d.setColor(LIME); d.checked = false; }, ORANGE);
            return;
          }
        }
        if (before > deliver && d.a <= deliver) {
          if (Math.random() < 0.55) { // results go to Improve
            var q1 = ringPoint(serve, deliver), q2 = ringPoint(improve, Math.PI + 0.5);
            toFly(d, bezier(q1, q2, -0.5), 0.9, function () { d.state = 'improve'; d.a = Math.PI + 0.5; d.exitA = 2.2 - Math.PI * 2; d.speed = 2.4; d.setColor(SOFT); });
          } else { d.state = 'fade'; d.life = 0.6; }
        }
      } else if (d.state === 'improve') {
        d.a -= d.speed * dt; ringPoint(improve, d.a, d.obj.position);
        if (d.a <= d.exitA) { // an illustrative comparison returns a candidate change to Make
          var r1 = ringPoint(improve, d.exitA), r2 = ringPoint(serve, stations[1].a);
          toFly(d, bezier(r1, r2, 0.8), 1.2, function () { d.state = 'fade'; d.life = 0.5; }, WHITE);
        }
      } else if (d.state === 'fly') {
        d.t += dt / d.dur; if (d.t >= 1) { d.t = 1; }
        d.curve.getPoint(d.t, tmp); d.obj.position.copy(tmp);
        if (d.t >= 1) d.next();
      } else if (d.state === 'fade') {
        d.life -= dt; var s = Math.max(0.01, d.life / 0.6); d.obj.scale.set(s, s, s);
        if (d.life <= 0) { group.remove(d.obj); d.dead = true; }
      }
    }
    // seed
    for (var i = 0; i < 7; i++) { var d0 = makeDot(LIME, 0.07); d0.state = 'serve'; d0.a = stations[0].a - i * 0.9; d0.speed = 0.85; d0.checked = d0.a < stations[2].a; ringPoint(serve, d0.a, d0.obj.position); dots.push(d0); }

    // sizing
    function resize() {
      var w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h;
      var t = Math.tan(camera.fov * Math.PI / 360);
      var d = Math.max(4.95 / (t * camera.aspect), 2.45 / t); // fit all three rings and their names
      camera.position.set(0, d * 0.2, d); camera.lookAt(0, -0.2, 0);
      scene.fog.near = d - 1.5; scene.fog.far = d + 9;
      camera.updateProjectionMatrix();
      if (ready) draw();
    }
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);

    // pointer
    var mouse = new THREE.Vector2(), target = { x: 0, y: 0 }, hover = null, ray = new THREE.Raycaster();
    var hits = rings.map(function (r) { return r.hit; });
    function onMove(e) {
      var rect = renderer.domElement.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
      target.y = (x - 0.5) * 0.5; target.x = (y - 0.5) * 0.22;
      mouse.set(x * 2 - 1, -(y * 2 - 1));
      ray.setFromCamera(mouse, camera);
      var hit = ray.intersectObjects(hits)[0];
      setHover(hit ? hit.object.userData.ring : null);
    }
    function setHover(r) {
      if (r === hover) return; hover = r;
      rings.forEach(function (x) { x.halo.material.opacity = (x === r) ? 0.22 : 0.07; x.mat.opacity = (x === r || x.key === 'serve') ? 1 : 0.75; });
      tip.textContent = r ? r.tip : defaultTip;
      renderer.domElement.style.cursor = r && r.href ? 'pointer' : '';
    }
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'mouse') return; target.x = target.y = 0; setHover(null); });
    // mouse: click a ring to open it. touch: first tap explains the ring, a second tap on it opens it.
    var armed = false;
    renderer.domElement.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') { armed = true; return; }
      var prev = hover; onMove(e); armed = !!hover && hover === prev;
    });
    renderer.domElement.addEventListener('click', function () { if (armed && hover && hover.href) window.location.href = hover.href; armed = false; });

    // loop
    var running = true, last = performance.now(), spawnT = 0, t0 = last, rafId = 0;
    function kick() { if (!rafId && running && !document.hidden) { last = performance.now(); rafId = requestAnimationFrame(frame); } }
    var io = window.IntersectionObserver ? new IntersectionObserver(function (en) { running = en[0].isIntersecting; kick(); }) : null;
    if (io) io.observe(stage);
    document.addEventListener('visibilitychange', kick);
    var speedK = reduced ? 0.3 : 1;
    function frame(now) {
      rafId = 0;
      if (!running || document.hidden) return;
      var dt = Math.min(0.05, (now - last) / 1000) * speedK; last = now;
      spawnT -= dt; if (spawnT <= 0) { spawnCustomer(); spawnT = 0.9 + Math.random() * 0.8; }
      for (var i = 0; i < dots.length; i++) stepDot(dots[i], dt);
      dots = dots.filter(function (d) { return !d.dead; });
      group.rotation.y += (target.y + Math.sin((now - t0) / 6000) * 0.08 - group.rotation.y) * 0.05;
      group.rotation.x += (target.x - group.rotation.x) * 0.05;
      var pulse = 1 + Math.sin(now / 300) * 0.08;
      stations[2].mesh.scale.set(pulse, pulse, pulse);
      draw();
      rafId = requestAnimationFrame(frame);
    }
    function draw() {
      renderer.render(scene, camera);
      var w = stage.clientWidth, h = stage.clientHeight;
      for (var k = 0; k < tags.length; k++) {
        var p = tags[k].pos(); group.localToWorld(p); p.project(camera);
        tags[k].el.style.left = ((p.x + 1) / 2 * w) + 'px'; tags[k].el.style.top = ((1 - p.y) / 2 * h) + 'px';
        tags[k].el.style.visibility = '';
      }
    }
    ready = true; group.updateMatrixWorld(true); draw(); // a first still frame, even before animation starts
    kick();
  }

  function boot() { document.querySelectorAll('[data-loops3d]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
