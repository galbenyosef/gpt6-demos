import * as THREE from 'three';

export interface ArchitectureContext {
  put: (geometry: THREE.BufferGeometry, material: THREE.Material, x?: number, y?: number, z?: number, ry?: number) => void;
  box: (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, ry?: number) => void;
  cylinder: (rt: number, rb: number, h: number, x: number, y: number, z: number, material: THREE.Material, segments?: number) => void;
  rod: (a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) => void;
  mat: (color: THREE.ColorRepresentation, roughness?: number, metalness?: number) => THREE.MeshStandardMaterial;
  granite: THREE.Material;
  edgeStone: THREE.Material;
  dark: THREE.Material;
  aluminum: THREE.Material;
  brass: THREE.Material;
  pavement: THREE.Material;
  curb: THREE.Material;
  grass: THREE.Material;
  glow: THREE.Material;
  glassMaterials: THREE.Material[];
  makeSignTexture: () => THREE.Texture;
}

/** Interpretive geometry based on frontview.webp, backview.png and topview.png. */
export function buildEuropa(context: ArchitectureContext) {
  const { put, box, cylinder, rod, mat, granite, edgeStone, dark, aluminum, brass,
    pavement, curb, grass, glow, glassMaterials, makeSignTexture } = context;
  // The new front/back references show ONE recessed crown-window row.
  // The narrow entrance end has two masonry cheeks around a recessed glass lift.
  box(43.8,47.6,18,1.9,24.8,0,granite);
  for(const side of [-1,1])box(3.5,48,5.3,-21.75,25,side*6.35,granite);
  const frontZ = (x:number) => 9 + 1.1 * (1-(x/24)**2);
  const crownY=46.4,crownSize=2.12;
  const openingShade=mat('#111a20',.85);
  const windowStone=mat('#677373',.48,.28);
  // Each crown opening has a dark setback, four stone reveals and a smaller inset sash.
  function crownWindow(x:number,z:number,angle:number){
    const normal=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
    const tangent=new THREE.Vector3(Math.cos(angle),0,-Math.sin(angle));
    const part=(w:number,h:number,d:number,u:number,y:number,depth:number,m:THREE.Material)=>{
      box(w,h,d,x+tangent.x*u+normal.x*depth,y,z+tangent.z*u+normal.z*depth,m,angle);
    };
    part(crownSize+.22,crownSize+.22,.06,0,crownY,.045,openingShade);
    part(1.48,1.36,.055,0,crownY+.03,.11,glassMaterials[1]!);
    // Projected surrounds make the glazing read as a recessed punched opening.
    part(.27,crownSize+.54,.48,-1.2,crownY,.28,windowStone);
    part(.27,crownSize+.54,.48,1.2,crownY,.28,windowStone);
    part(2.15,.26,.48,0,crownY+1.2,.28,windowStone);
    part(2.15,.28,.57,0,crownY-1.2,.32,windowStone);
    part(1.62,.07,.1,0,crownY-.69,.18,aluminum);
    part(.065,1.42,.1,-.78,crownY,.18,aluminum);
    part(.065,1.42,.1,.78,crownY,.18,aluminum);
    part(1.62,.065,.1,0,crownY+.7,.18,aluminum);
    part(1.49,.055,.09,0,crownY-.24,.18,aluminum);
  }
  const bayCount=13,bayPitch=3.35;
  for(let bay=0;bay<bayCount;bay++){
    const x=-19.9+bay*bayPitch,z=frontZ(x),angle=Math.atan(2.2*x/(24*24));
    // Glazing terminates distinctly below the massive stone crown beam.
    box(2.45,37.3,.3,x,24.45,z,glassMaterials[bay%8]!,angle);
    for(let floor=0;floor<12;floor++){
      const y=5.86+floor*3.08;
      box(2.39,3.01,.035,x,y+1.5,z+.175,glassMaterials[(bay+floor%3)%8]!,angle);
      box(2.46,.048,.07,x,y,z+.22,aluminum,angle);
      box(.035,3.02,.045,x,y+1.5,z+.22,aluminum,angle);
    }
    box(3.34,5.4,1.15,x,46.35,z-.21,granite,angle);
    crownWindow(x,z+.38,angle);
    if(bay<bayCount-1){const px=x+1.675;box(.89,48.1,1.15,px,25,frontZ(px)+.1,granite,angle);box(.065,38,.08,px-.46,24.1,frontZ(px)+.71,edgeStone,angle);}
    // Dark ground-floor plinth: glazed retail bays sit beneath the tall mirror strips.
    box(2.48,3.4,.22,x,3.0,z+.02,glassMaterials[0]!,angle);
    box(2.65,.62,.25,x,4.95,z+.12,dark,angle);
    box(.055,3.3,.07,x,3,z+.18,brass,angle);
  }
  box(1.6,48,1.4,-22.25,25,9.05,edgeStone);
  box(1.65,48,1.4,23.15,25,9.05,edgeStone);
  // Right end: four tall slots and the same single crown-window band.
  for(let bay=0;bay<4;bay++){
    const z=-5.25+bay*3.5;
    box(.25,37.3,2.3,23.98,24.45,z,glassMaterials[(bay+3)%8]!);
    for(let floor=0;floor<12;floor++)box(.075,.05,2.32,24.14,5.86+floor*3.08,z,aluminum);
    crownWindow(24.05,z,Math.PI/2);
    if(bay<3)box(.75,48,1,24.03,25,z+1.75,granite);
  }
  // Rear elevation: mirror strips flank a visibly different gridded service core.
  box(47.6,5.4,.65,0,46.35,-8.95,granite);
  const serviceX=-1.475;
  for(let bay=0;bay<14;bay++){
    const x=-21.8+bay*3.35;
    if(Math.abs(x-serviceX)<2.05)continue;
    box(2.36,37.3,.25,x,24.45,-9.13,glassMaterials[bay%8]!);
    for(let f=0;f<12;f++)box(2.39,.055,.05,x,5.86+f*3.08,-9.3,aluminum);
    crownWindow(x,-9.25,Math.PI);
    if(bay<13)box(.94,48,.8,x+1.68,25,-9.25,granite);
  }
  box(4.45,48,.75,serviceX,25,-9.34,granite);
  box(2.42,45,.12,serviceX,25.2,-9.77,glassMaterials[3]!);
  for(let col=0;col<4;col++)box(.11,45,.13,serviceX-1.23+col*.82,25.2,-9.86,edgeStone);
  for(let row=0;row<37;row++)box(2.48,row%3===0?.24:.075,.13,serviceX,3.2+row*1.23,-9.86,edgeStone);
  box(.42,48,.85,serviceX-2.3,25,-9.4,edgeStone);box(.42,48,.85,serviceX+2.3,25,-9.4,edgeStone);

  // Entrance lift: slim mirrored shaft in a deep slot beneath the suspended crown.
  const towerX=-24.1,towerZ=0;
  box(.18,36,7.2,-21.6,25,0,openingShade);
  cylinder(1.8,1.8,32.7,towerX,25.1,towerZ,glassMaterials[3]!,64);
  for(let i=0;i<16;i++){
    const a=i/16*Math.PI*2;
    box(.052,32.7,.055,towerX+1.83*Math.sin(a),25.1,towerZ+1.83*Math.cos(a),aluminum,a);
  }
  for(let f=0;f<11;f++)cylinder(1.84,1.84,.045,towerX,9.1+f*3.04,0,aluminum,64);
  // Dark neck above the lift and a substantial shadowed underside to the crown.
  cylinder(2.55,2.55,2.2,towerX,42,0,dark,64);
  cylinder(4.7,2.65,1.65,towerX,43.13,0,dark,64);
  cylinder(4.7,4.7,5.1,towerX,46.45,0,granite,64);
  cylinder(4.88,4.88,.32,towerX,49.15,0,dark,64);
  cylinder(4.72,4.72,.13,towerX,49.4,0,edgeStone,64);
  // Only the exposed half of the rounded crown receives windows.
  for(const degrees of [-162,-126,-90,-54,-18]){
    const a=THREE.MathUtils.degToRad(degrees);
    crownWindow(towerX+4.72*Math.sin(a),4.72*Math.cos(a),a);
  }
  for(const side of [-1,1]){
    // Broad, flat masonry cheeks are a prominent feature in the frontal reference.
    box(3.1,48,2.1,-23.6,25,side*5.75,granite);
    box(.11,46,2.08,-25.2,25,side*5.75,edgeStone);
    box(.18,34,1.04,-25.23,25.1,side*3.87,glassMaterials[2]!);
    for(let f=0;f<11;f++)box(.2,.055,1.06,-25.25,9.1+f*3.04,side*3.87,aluminum);
  }

  // Wide, low entrance rotunda with bronze mullions, transoms and visible lobby depth.
  const lobbyGlass=new THREE.MeshPhysicalMaterial({color:'#6b817d',metalness:.18,roughness:.11,transparent:true,opacity:.52,depthWrite:false,side:THREE.DoubleSide});
  const interiorStone=mat('#b9a58a',.72);
  cylinder(6.65,6.65,.22,towerX,1.35,0,pavement,64);
  cylinder(6.15,6.15,.15,towerX,6.75,0,dark,64);
  box(.25,5,10.3,-21.5,3.95,0,interiorStone);
  for(let side of [-1,1])box(4.3,5,.22,-24,3.95,side*5.2,interiorStone);
  // Faceted glazing follows the broad semicircular frontage; a gap is left for doors.
  for(let i=0;i<24;i++){
    const a=-Math.PI+(i+.5)/24*Math.PI;
    const x=towerX+6.25*Math.sin(a),z=6.25*Math.cos(a);
    if(Math.abs(a+Math.PI/2)>.22)box(.81,5.05,.045,x,4.05,z,lobbyGlass,a);
    box(.075,5.3,.105,x,4.02,z,brass,a);
    box(.84,.065,.1,x,3.2,z,brass,a);
    box(.84,.09,.1,x,5.6,z,brass,a);
  }
  const doorX=towerX-6.32;
  box(.12,3.6,2.8,doorX,3.2,0,dark);
  box(.14,3.4,2.57,doorX-.075,3.2,0,lobbyGlass);
  for(const z of [-1.35,0,1.35])box(.14,3.55,.075,doorX-.17,3.2,z,brass);
  for(const z of [-.17,.17])box(.13,1.02,.055,doorX-.29,3,z,brass);
  box(.2,.09,2.8,doorX-.16,4.95,0,brass);
  // A warm interior band remains legible after switching to blue hour.
  for(const z of [-3.4,0,3.4])box(.12,.14,1.3,-22.2,5.8,z,glow);
  // Low radial metal canopy, with standing seams and a small glazed collar above it.
  cylinder(1.95,7.15,1.58,towerX,7.65,0,dark,96);
  cylinder(7.17,7.17,.2,towerX,6.85,0,edgeStone,96);
  for(let i=0;i<48;i++){
    const a=i/48*Math.PI*2;
    rod(new THREE.Vector3(towerX+1.98*Math.sin(a),8.47,1.98*Math.cos(a)),new THREE.Vector3(towerX+7.17*Math.sin(a),6.92,7.17*Math.cos(a)),.025,edgeStone);
  }
  cylinder(1.91,1.91,1.32,towerX,9.03,0,glassMaterials[0]!,48);
  cylinder(2.15,2.15,.16,towerX,9.77,0,dark,64);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;box(.06,1.35,.07,towerX+1.94*Math.sin(a),9.03,1.94*Math.cos(a),brass,a);}
  const signTexture=makeSignTexture();
  box(3.35,.48,.065,doorX-.2,5.34,0,new THREE.MeshStandardMaterial({map:signTexture,roughness:.55}),-Math.PI/2);
  // Broad shallow steps and spherical forecourt bollards seen in frontview.webp.
  for(let i=0;i<3;i++)box(1.05,.14*(i+1),5.9,doorX-2.3+i*.9,.72+.07*(i+1),0,curb);
  for(let i=0;i<9;i++){
    const z=-11.2+i*2.8;put(new THREE.SphereGeometry(.32,16,12),dark,-36.8,1.03,z);
    cylinder(.09,.11,.22,-36.8,.76,z,dark,8);
  }
  for(const z of [-7.8,7.8]){box(4.2,.65,2.2,-30.5,1.02,z,curb);box(3.9,.25,1.95,-30.5,1.46,z,grass);}

  // Secondary garden pavilion retains its separate shallow roof.
  cylinder(4.4,4.4,3.2,25.5,2.8,9,glassMaterials[1]!,48);cylinder(.7,5.7,2.2,25.5,5.4,9,dark,64);cylinder(5.8,5.8,.17,25.5,4.35,9,edgeStone,64);
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2;box(.08,3.2,.08,25.5+4.45*Math.sin(a),2.8,9+4.45*Math.cos(a),aluminum,a);}

  // Aerial reference: broad sloping perimeter, recessed services, central terracotta plant room.
  const roofMetal=mat('#a2b0b4',.58,.35),roofDeck=mat('#646f71',.94),terracotta=mat('#bd7b63',.85),duct=mat('#9babae',.43,.65);
  const roofShape=new THREE.Shape();roofShape.moveTo(-19.5,-6);roofShape.lineTo(21.5,-6);roofShape.lineTo(21.5,6);roofShape.lineTo(-19.5,6);roofShape.absarc(-19.5,0,6,Math.PI/2,Math.PI*1.5,false);
  const roofG=new THREE.ShapeGeometry(roofShape,40);roofG.rotateX(-Math.PI/2);put(roofG,roofDeck,0,48.7,0);
  function roofStrip(w:number,d:number,x:number,z:number,rx=0,rz=0){const g=new THREE.BoxGeometry(w,.18,d);g.rotateX(rx);g.rotateZ(rz);put(g,roofMetal,x,49.58,z);}
  roofStrip(45,3.1,.2,7.48,.23);roofStrip(45,3.1,.2,-7.48,-.23);roofStrip(3.2,12.1,22.38,0,0,-.23);
  for(let i=0;i<30;i++){
    const a=-Math.PI+(i+.5)/30*Math.PI;
    const g=new THREE.BoxGeometry(.78,.18,3.1);g.rotateX(.23);g.rotateY(a);
    put(g,roofMetal,-19.5+7.45*Math.sin(a),49.58,7.45*Math.cos(a));
  }
  box(46,.24,.3,.2,49.98,9.03,edgeStone);box(46,.24,.3,.2,49.98,-9.03,edgeStone);box(.3,.24,18.3,23.38,49.98,0,edgeStone);
  // Fine standing seams on the sloped metal perimeter.
  for(let x=-20;x<22;x+=1.05)for(const side of [-1,1])rod(new THREE.Vector3(x,49.25,side*6.05),new THREE.Vector3(x,49.95,side*8.92),.014,edgeStone);
  box(8.7,.22,10.4,-2,48.94,0,terracotta);
  box(6.1,1.14,3.45,-2,49.64,-2.85,terracotta);
  box(6.4,.15,3.7,-2,50.29,-2.85,roofMetal);
  box(2.9,1.45,2.7,-2,49.78,2.2,duct);
  box(3.2,.13,3,-2,50.56,2.2,roofMetal);
  // Rooftop equipment sits down in the court rather than on an invented stacked penthouse.
  for(const [x,z,w,d] of [[-14,-2.5,6.8,2.35],[-12,2.2,4.1,2.1],[7,-2.8,4.4,2.4],[13,-2.8,3.3,2.4],[8.8,2.4,5.8,2.3],[17.3,2.2,3.1,2.8],[18,-2.2,2.7,2.7]]){
    box(w!,1,d!,x!,49.4,z!,duct);
    for(let j=0;j<Math.max(1,Math.floor(w!/1.5));j++){
      const fanX=x!-w!/2+1+j*1.5;cylinder(.5,.5,.06,fanX,49.95,z!,dark,20);
      for(let spoke=0;spoke<5;spoke++){const a=spoke*Math.PI*2/5;rod(new THREE.Vector3(fanX,49.99,z!),new THREE.Vector3(fanX+.4*Math.cos(a),49.99,z!+.4*Math.sin(a)),.025,edgeStone);}
    }
    for(let j=0;j<5;j++)box(w!-.2,.045,.035,x!,49.07+j*.16,z!+d!/2+.02,aluminum);
  }
  // Cable trays, pipe runs, maintenance rails and short aerials from the roof reference.
  for(const z of [-4.65,4.65]){
    box(39,.12,.48,.8,49.03,z,aluminum);
    for(let x=-17;x<21;x+=1.2)box(.09,.08,.52,x,49.12,z,duct);
    for(let line=0;line<3;line++)rod(new THREE.Vector3(-17,49.27,z+line*.17),new THREE.Vector3(20,49.27,z+line*.17),.035,duct);
  }
  for(let x=-15;x<22;x+=3)for(const z of [-5.6,5.6])rod(new THREE.Vector3(x,48.85,z),new THREE.Vector3(x,49.75,z),.023,aluminum);
  for(const z of [-5.6,5.6])rod(new THREE.Vector3(-17,49.75,z),new THREE.Vector3(21,49.75,z),.023,aluminum);
  cylinder(.035,.06,3.3,18,50.7,-5,aluminum,8);cylinder(.035,.06,2.8,-16,50.4,-5,aluminum,8);
}
