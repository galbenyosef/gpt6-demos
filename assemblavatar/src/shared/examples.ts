export const examples = {
  house: { name: "Courtyard house", kind: "object" as const, code: `export function buildModel(ctx: ModelBuildContext): ModelBuildOutput {
  const r = ctx.runtime;
  const root = r.create.group("Courtyard house");
  const plaster = r.material.standard({baseColor: "#d9d4c5", roughness: 0.82});
  const charcoal = r.material.standard({baseColor: "#303942", roughness: 0.6});
  const glass = r.material.standard({baseColor: "#6e9cab", metalness: 0.35, roughness: 0.18});
  const body = r.create.box({name: "Main volume", width: 4.8, height: 2.35, depth: 3.2, material: plaster});
  r.transform.position(body, [0, 1.28, 0]);
  const recess = r.create.box({width: 1.1, height: 2.1, depth: 0.8});
  r.transform.position(recess, [0.6, 1.12, 1.6]);
  root.add(r.geometry.subtract(body, recess));
  const roof = r.create.box({name: "Floating roof", width: 5.15, height: 0.22, depth: 3.6, material: charcoal});
  r.transform.position(roof, [0, 2.58, 0]); root.add(roof);
  const base = r.create.box({name: "Foundation", width: 5.4, height: 0.18, depth: 4, material: plaster});
  r.transform.position(base, [0, 0.09, 0]); root.add(base);
  for (let i = 0; i < 2; i++) {
    const pane = r.create.box({name: "Front window " + i, width: 1.04, height: 1.2, depth: 0.07, material: glass});
    r.transform.position(pane, [i === 0 ? -1.45 : 1.65, 1.48, 1.63]); root.add(pane);
  }
  const door = r.create.box({name: "Recessed oak door", width: 0.84, height: 1.94, depth: 0.06, material: {baseColor: "#88684a", roughness: 0.7}});
  r.transform.position(door, [0.6, 1.09, 1.23]); root.add(door);
  const path = r.create.box({name: "Entrance step", width: 1.5, height: 0.12, depth: 1.15, material: charcoal});
  r.transform.position(path, [0.6, 0.15, 2.08]); root.add(path);
  const planter = r.create.box({name: "Planter", width: 1.5, height: 0.38, depth: 0.55, material: charcoal});
  r.transform.position(planter, [-1.4, 0.38, 1.84]); root.add(planter);
  for (let i = 0; i < 5; i++) {
    const shrub = r.create.ellipsoid({name: "Plant " + i, width: 0.42, height: 0.5, depth: 0.4, material: {baseColor: "#567563", roughness: 0.9}});
    r.transform.position(shrub, [-1.96 + i * 0.28, 0.72, 1.84]); root.add(shrub);
  }
  return {root, metadata: {description: "Hand-written procedural runtime example"}};
}` },
  robot: { name: "Studio robot", kind: "object" as const, code: `export function buildModel(ctx: ModelBuildContext): ModelBuildOutput {
  const r = ctx.runtime; const root = r.create.group("Robot");
  const body = r.create.box({name:"Body", width:1.3, height:1.4, depth:0.75, material:{baseColor:"#d4e45c", roughness:0.4}});
  r.transform.position(body,[0,1.4,0]); root.add(body);
  const head = r.create.box({name:"Head",width:1.2,height:0.75,depth:0.8,material:{baseColor:"#e0e7e7"}});
  r.transform.position(head,[0,2.55,0]); root.add(head);
  for(let i=0;i<2;i++) { const side = i===0 ? -1 : 1;
    const eye=r.create.sphere({name:"Eye " + i,radius:0.11,material:{baseColor:"#182634",metalness:0.5}}); r.transform.position(eye,[side*0.28,2.6,0.41]); root.add(eye);
    const arm=r.create.capsule({name:"Arm " + i,radius:0.16,length:0.75,material:{baseColor:"#82929d"}}); r.transform.position(arm,[side*0.9,1.45,0]); root.add(arm);
    const leg=r.create.cylinder({name:"Leg " + i,radius:0.18,height:0.6,material:{baseColor:"#82929d"}}); r.transform.position(leg,[side*0.35,0.4,0]); root.add(leg);
    const foot=r.create.box({name:"Foot " + i,width:0.5,height:0.22,depth:0.7,material:{baseColor:"#303c47"}}); r.transform.position(foot,[side*0.35,0.11,0.13]); root.add(foot);
  }
  return {root};
}` },
  head: { name: "Clay character", kind: "avatar" as const, code: `export function buildModel(ctx: ModelBuildContext): ModelBuildOutput {
  const r=ctx.runtime; const root=r.create.group("Clay character"); const skin=r.material.skin({baseColor:"#bf947f"});
  const head=r.create.ellipsoid({name:"Head",width:1.45,height:1.95,depth:1.35,segments:48,material:skin});
  r.geometry.deform(head,{type:"scale-region",centre:[0,-0.6,0.2],radius:0.65,scale:[0.82,1,1],falloff:"smooth"}); r.transform.position(head,[0,1.8,0]); root.add(head);
  const neck=r.create.cylinder({name:"Neck",radius:0.3,height:0.65,material:skin});r.transform.position(neck,[0,0.65,0]);root.add(neck);
  const bust=r.create.ellipsoid({name:"Shoulders",width:2.1,height:0.7,depth:1,material:{baseColor:"#475c67"}});r.transform.position(bust,[0,0.25,0]);root.add(bust);
  const nose=r.create.ellipsoid({name:"Nose",width:0.22,height:0.42,depth:0.4,material:skin});r.transform.position(nose,[0,1.7,0.66]);root.add(nose);
  for(let i=0;i<2;i++){const s=i===0?-1:1;const eye=r.create.ellipsoid({name:"Eye "+i,width:0.22,height:0.12,depth:0.08,material:{baseColor:"#283036"}});r.transform.position(eye,[s*0.31,1.99,0.605]);root.add(eye);const ear=r.create.ellipsoid({name:"Ear "+i,width:0.23,height:0.46,depth:0.25,material:skin});r.transform.position(ear,[s*0.73,1.75,0]);root.add(ear);}
  const hair=r.create.ellipsoid({name:"Hair",width:1.5,height:0.75,depth:1.38,material:{baseColor:"#383038"}});r.transform.position(hair,[0,2.52,-0.12]);root.add(hair);
  const mouth=r.create.ellipsoid({name:"Mouth",width:0.38,height:0.07,depth:0.07,material:{baseColor:"#805a52"}});r.transform.position(mouth,[0,1.37,0.6]);root.add(mouth);
  return {root};
}` },
};
