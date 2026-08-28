export const RACER_BADGES = ['PK','WH','AP','DV','AI','DH','CH','JT'];

const icon = (body, accent = '#22c55e') => `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs>${body}</svg>`;

export const ITEM_DEFS = [
  {id:'candle',name:'GREEN CANDLE',short:'CANDLE',accent:'#43f47a',icon:icon('<path d="M14 49h38v6H14z" fill="#0b2d18"/><path d="M20 42l9-11 8 6 12-19" fill="none" stroke="url(#g)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 18h9v9" fill="none" stroke="#0b2d18" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>','#43f47a')},
  {id:'rocket',name:'PUMP ROCKET',short:'ROCKET',accent:'#ff9f43',icon:icon('<path d="M38 10c8 2 14 8 16 16L37 43 21 27z" fill="url(#g)" stroke="#0b2d18" stroke-width="4"/><circle cx="39" cy="25" r="5" fill="#0b2d18"/><path d="M22 31l-8 3 7 7m10-4-3 13 9-8" fill="#ff6a3d" stroke="#0b2d18" stroke-width="4" stroke-linejoin="round"/><path d="M18 44l-8 9m16-7-5 9" stroke="#ffe45f" stroke-width="5" stroke-linecap="round"/>','#ff9f43')},
  {id:'diamond',name:'DIAMOND HANDS',short:'SHIELD',accent:'#58dcff',icon:icon('<path d="M12 25l9-13h22l9 13-20 28z" fill="url(#g)" stroke="#0b2d18" stroke-width="4" stroke-linejoin="round"/><path d="M12 25h40M21 12l11 13 11-13M32 25v28" fill="none" stroke="#0b2d18" stroke-width="3"/>','#58dcff')},
  {id:'rug',name:'RUG PULL',short:'RUG',accent:'#ff5964',icon:icon('<path d="M12 18h40v28H12z" fill="url(#g)" stroke="#0b2d18" stroke-width="4"/><path d="M18 24l9 8-9 8m28-16-9 8 9 8M12 50h40" fill="none" stroke="#0b2d18" stroke-width="4" stroke-linecap="round"/><path d="M16 48v7m8-7v7m16-7v7m8-7v7" stroke="#ff5964" stroke-width="3"/>','#ff5964')},
  {id:'mev',name:'MEV ZAP',short:'ZAP',accent:'#bf7cff',icon:icon('<path d="M34 7L15 35h14l-2 22 22-31H35z" fill="url(#g)" stroke="#0b2d18" stroke-width="4" stroke-linejoin="round"/><circle cx="13" cy="14" r="5" fill="#bf7cff"/><circle cx="51" cy="49" r="5" fill="#58dcff"/>','#bf7cff')},
  {id:'airdrop',name:'AIRDROP',short:'DROP',accent:'#ffd84d',icon:icon('<path d="M14 24c2-11 10-17 18-17s16 6 18 17l-18 9z" fill="url(#g)" stroke="#0b2d18" stroke-width="4"/><path d="M16 25l10 15m22-15L38 40M32 32v8" stroke="#0b2d18" stroke-width="3"/><rect x="23" y="39" width="18" height="16" rx="3" fill="#ffd84d" stroke="#0b2d18" stroke-width="4"/>','#ffd84d')}
];

export function createMicroFX(THREE, scene, {reducedMotion = false} = {}) {
  const effects = [];
  const maxEffects=reducedMotion?48:(globalThis.innerWidth<700?90:140);
  const shardGeo = new THREE.BoxGeometry(.28,.72,.12);
  const sparkGeo = new THREE.OctahedronGeometry(.18,0);
  const streakGeo = new THREE.BoxGeometry(.09,.09,1.4);
  const ringGeo = new THREE.TorusGeometry(1,.085,6,28);
  const pulseGeo = new THREE.IcosahedronGeometry(1,2);
  const material = (color, opacity=.9) => new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});
  const retire = e => {if(e.light)scene.remove(e.light);if(e.mesh){scene.remove(e.mesh);if(e.mesh.material)e.mesh.material.dispose()}};
  const trim = () => {while(effects.length>=maxEffects)retire(effects.shift())};
  const add = (mesh, vel, life, extra={}) => {trim();scene.add(mesh);effects.push({mesh,vel,life,max:life,spin:new THREE.Vector3((Math.random()-.5)*8,(Math.random()-.5)*8,(Math.random()-.5)*8),...extra});return mesh};

  function burst(origin,color=0x6dff8a,count=18,power=1){
    const total=reducedMotion?Math.ceil(count*.45):count;
    for(let i=0;i<total;i++){
      const m=new THREE.Mesh(i%3?sparkGeo:shardGeo,material(i%4===0?0xffffff:color,.95));
      m.position.copy(origin);m.position.x+=(Math.random()-.5)*1.2;m.position.y+=.4+Math.random()*1.2;m.position.z+=(Math.random()-.5)*1.2;m.scale.setScalar(.65+Math.random()*.9);
      const a=Math.random()*Math.PI*2,speed=(3+Math.random()*7)*power;
      add(m,new THREE.Vector3(Math.cos(a)*speed,2+Math.random()*7*power,Math.sin(a)*speed),.45+Math.random()*.5,{gravity:11});
    }
  }
  function ring(origin,color=0x6dff8a,scale=1,life=.5){
    const m=new THREE.Mesh(ringGeo,material(color,.86));m.position.copy(origin);m.rotation.x=Math.PI/2;m.scale.setScalar(scale);
    add(m,new THREE.Vector3(),life,{expand:7*scale,fadePower:1.7});
  }
  function flash(origin,color=0x6dff8a,intensity=5,life=.24){
    if(reducedMotion)return;trim();const light=new THREE.PointLight(color,intensity,18,2);light.position.copy(origin);scene.add(light);effects.push({light,life,max:life});
  }
  function pickup(origin){
    burst(origin,0x69ff8c,32,1.35);ring(origin,0xffffff,1.1,.42);ring(origin,0x5aff83,.65,.6);
    const shell=new THREE.Mesh(pulseGeo,material(0x6dff8d,.48));shell.position.copy(origin);shell.scale.setScalar(.28);add(shell,new THREE.Vector3(),.52,{expand:6.8,spinScale:1});
    const cage=new THREE.Mesh(pulseGeo,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.85,wireframe:true,depthWrite:false,blending:THREE.AdditiveBlending}));cage.position.copy(origin);cage.scale.setScalar(.45);add(cage,new THREE.Vector3(),.62,{expand:5.2,spinScale:1.2});
    const total=reducedMotion?4:12;for(let n=0;n<total;n++){const beam=new THREE.Mesh(streakGeo,material(n%3?0x67ff8b:0xffffff,.95));beam.position.copy(origin).add(new THREE.Vector3((Math.random()-.5)*2,Math.random()*1.5,(Math.random()-.5)*2));beam.scale.z=1.3+Math.random()*2;add(beam,new THREE.Vector3((Math.random()-.5)*3,8+Math.random()*9,(Math.random()-.5)*3),.32+Math.random()*.28)}
    flash(origin,0x63ff88,9,.32)
  }
  function respawn(origin){ring(origin,0x6eff91,.45,.75);burst(origin,0xffffff,8,.45);flash(origin,0x5cff7b,3,.18)}
  function boost(origin,forward=new THREE.Vector3(0,0,1),strength=1){
    ring(origin,0xffec70,.75,.34);burst(origin,0x6dff8e,Math.round(12*strength),.7);
    const total=reducedMotion?4:10;for(let i=0;i<total;i++){const m=new THREE.Mesh(streakGeo,material(i%3?0x66ff88:0xffef73,.82));m.position.copy(origin).add(new THREE.Vector3((Math.random()-.5)*3,Math.random()*1.5,(Math.random()-.5)*3));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),forward.clone().normalize());m.scale.z=.7+Math.random()*1.4;add(m,forward.clone().multiplyScalar(-10-Math.random()*10),.22+Math.random()*.22)}
  }
  function drift(origin,charge=0){burst(origin,charge>.9?0xffd84d:0x63e9ff,reducedMotion?1:3,.35+.25*charge)}
  function impact(origin){burst(origin,0xffd966,18,1);ring(origin,0xffffff,.5,.3);flash(origin,0xffd55f,4,.16)}
  function itemUse(id,origin,forward=new THREE.Vector3(0,0,1)){
    const colors={candle:0x52ff7d,rocket:0xff8c42,diamond:0x62dcff,rug:0xff5360,mev:0xbb72ff,airdrop:0xffdb55},color=colors[id]||0xffffff;
    if(id==='rocket'){for(let n=0;n<3;n++)ring(origin,color,.7+n*.35,.28+n*.1);boost(origin,forward,1.7)}
    else if(id==='diamond'){for(let n=0;n<3;n++){const m=new THREE.Mesh(new THREE.OctahedronGeometry(2+n*.55,0),material(color,.35-n*.08));m.position.copy(origin);add(m,new THREE.Vector3(),.7+n*.15,{expand:.7,spinScale:.6})}}
    else if(id==='mev'){for(let n=0;n<8;n++){const m=new THREE.Mesh(streakGeo,material(n%2?color:0x6be7ff,.9));m.position.copy(origin).add(new THREE.Vector3((Math.random()-.5)*3,1+Math.random()*3,(Math.random()-.5)*3));m.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);add(m,new THREE.Vector3((Math.random()-.5)*12,3+Math.random()*7,(Math.random()-.5)*12),.28+Math.random()*.3)}}
    else if(id==='rug'){burst(origin,color,28,1.1);ring(origin,color,.8,.48)}
    else if(id==='airdrop'){burst(origin,0xffdd55,24,.9);ring(origin,0xffffff,1,.55)}
    else{boost(origin,forward,1.25);ring(origin,color,.8,.45)}
    flash(origin,color,6,.22);
  }
  function celebration(origin,color=0xffdf59){for(let n=0;n<4;n++)setTimeout(()=>{burst(origin,color,22,1.1);ring(origin,n%2?0x62ff85:0xffffff,.8+n*.18,.55)},n*110)}
  function update(dt){
    for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;if(e.light){e.light.intensity=Math.max(0,7*e.life/e.max);if(e.life<=0){scene.remove(e.light);effects.splice(i,1)}continue}const m=e.mesh;if(e.vel)m.position.addScaledVector(e.vel,dt);if(e.gravity)e.vel.y-=e.gravity*dt;if(e.spin){m.rotation.x+=e.spin.x*dt;m.rotation.y+=e.spin.y*dt;m.rotation.z+=e.spin.z*dt}if(e.expand)m.scale.addScalar(e.expand*dt);if(e.spinScale)m.rotation.y+=dt*9;if(m.material)m.material.opacity=Math.max(0,Math.pow(Math.max(0,e.life/e.max),e.fadePower||1));if(e.life<=0){scene.remove(m);if(m.material)m.material.dispose();effects.splice(i,1)}}
  }
  return {pickup,respawn,boost,drift,impact,itemUse,celebration,update,get count(){return effects.length}};
}
