import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
//import Stats from 'three/addons/libs/stats.module.js'
import { GUI } from 'dat.gui'
import TWEEN from '@tweenjs/tween.js'
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export class FrameBase 
{
  //True if regeneration should be animated (USER SETTING)
  public animateRegeneration: boolean = false;

  //True if regeneration should loop (USER SETTING)
  public regenerationLoop: boolean = false;

  //Interval between regenerations (USER SETTING)
  public regenerationInterval: number = 5;

  //Show DAT.GUI (USER SETTING) - cannot be 
  readonly showGUI: boolean = true;

  //Scene objects
  protected scene: THREE.Scene;
  protected camera: THREE.PerspectiveCamera;
  protected renderer: THREE.WebGLRenderer;
  protected structureParentObj: THREE.Mesh;
  protected baseParentObj: THREE.Mesh;
  protected hostObj: THREE.Mesh;

  //stats: Stats;

  constructor(hostId : string, animateRegeneration: boolean = false, regenerationLoop: boolean = false, regenerationInterval: number = 5, showGUI: boolean = true) {

    this.animateRegeneration = animateRegeneration;
    this.regenerationLoop = regenerationLoop;
    this.regenerationInterval = regenerationInterval;
    this.showGUI = showGUI;

    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    
    //RENDERER
    this.renderer = new THREE.WebGLRenderer()
    this.renderer.setSize(window.innerWidth, window.innerHeight)

    // Find the grid element by its ID and append the renderer's DOM element to it
    const gridElement = document.getElementById(hostId);
    if (gridElement) {
      gridElement.appendChild(this.renderer.domElement);
    } else {
      console.error('Grid element not found');
    }
    // document.body.appendChild(this.renderer.domElement)
    
    //WINDOW RESIZE
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
    })
    
    // Set the background color of the renderer to transparent white
    this.renderer.setClearColor(0xffffff, 0);

    let controls = new OrbitControls(this.camera, this.renderer.domElement);
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI / 2;
    controls.minPolarAngle = -Math.PI;
    controls.enableZoom = false;
    
    //DEBUG GEOMETRY
    const materialTransparentGreen = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.0 }) //set to 0.5 opacity for debugging
    const materialTransparentRed = new THREE.MeshBasicMaterial({ color: 0xFF0000, transparent: true, opacity: 0.0 }) //set to 0.5 opacity for debugging

    // const parentGeometry = new THREE.BoxGeometry(parentSize.width, parentSize.height,parentSize.depth)
    const parentGeometry = new THREE.BoxGeometry(0.1,10,0.1)
    
    //This is the parent mesh which will contain all the child meshes
    this.structureParentObj = new THREE.Mesh(parentGeometry, materialTransparentGreen) 
    this.baseParentObj = new THREE.Mesh(parentGeometry, materialTransparentGreen) 
    
    //This is the host mesh which will contain the parent mesh
    //The centre of the parent mesh bounding box will be at the origin of the host mesh
    //The host mesh will be rotated
    this.hostObj = new THREE.Mesh(parentGeometry, materialTransparentRed) 
    
    this.hostObj.add(this.structureParentObj)
    this.hostObj.add(this.baseParentObj)
    this.scene.add(this.hostObj)


    //LIGHT
    let directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(0, 2, 10).normalize();
    directionalLight.target.position.set(0, 0, 0); // Set the target position to the origin
    this.hostObj.add(directionalLight);
    //this.scene.add(directionalLight);

    //LIGHT
    let directionalLight2 = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(0, 2, -10).normalize();
    directionalLight.target.position.set(0, 0, 0); // Set the target position to the origin
    this.hostObj.add(directionalLight2);
    //this.scene.add(directionalLight);

    // AMBIENT LIGHT
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(ambientLight);

    //STATS
    //this.stats = new Stats();
    //this.stats.showPanel(0)
    //document.body.appendChild(this.stats.dom)

    //DAT.GUI
    if(this.showGUI)
      this.SetupGUI();

    this.animate()
  }

  SetupGUI() {

    const gui = new GUI()

    const geometryFolder = gui.addFolder('Bay size')
    geometryFolder.add(this, 'unitHeight', 2, 5).step(0.1).name('Storey Height')
    geometryFolder.add(this, 'unitWidth', 4, 10).step(0.1).name('Grid X Width')
    geometryFolder.add(this, 'unitDepth', 4, 10).step(0.1).name('Grid Y Depth')
    //geometryFolder.open()

    const frameFolder = gui.addFolder('Total extents')
    frameFolder.add(this, 'heightSize', 2, 7).step(1).name('Max Storeys')
    frameFolder.add(this, 'widthSize', 2, 10).step(1).name('Max X Bays')
    frameFolder.add(this, 'depthSize', 2, 10).step(1).name('Max Y Bays')
    //frameFolder.open()
    
    const animationFolder = gui.addFolder('Animation Options');
    animationFolder.add(this, 'pauseRotation').name('Pause Rotation');
    animationFolder.add(this, 'regenerationLoop').name('Regen. Loop');
    animationFolder.add(this, 'regenerationInterval', 1, 7).step(0.5).name('Regen. Delay');
    animationFolder.add(this, 'animateRegeneration').name('Animate Regen.');
    //animationFolder.add(this.stats, 'showPanel').name('Toggle Stats');
    
    gui.add({ click: this.TriggerRegeneration.bind(this) }, 'click').name('Trigger Regeneration');
    gui.close();
  }

  public widthSize = 5;
  public heightSize = 5;
  public depthSize = 5;
  public unitWidth = 7;
  public unitHeight = 3.5;
  public unitDepth = 7;

  //If this is false, the rotation animation will be paused
  public pauseRotation = false;


  //A flag to indicate if the frame is currently animating
  //If it is, other requests to regenerate the frame will be ignored
  protected isAnimating = false;

  //The time since the last regeneration
  //This is used to determine when to do the next regeneration
  //if the regeneration loop is enabled
  private timeSinceLastRegeneration = 0;

  //As per three.js coordinate system, x is width, y is height, z is depth
  //Each item represents a voxel in the frame, true if the voxel is filled, false if it is empty
  protected voxelArray: Array<Array<Array<boolean>>> = [];

  //Array of columns, Each column is a VERTICAL CORNER EDGE of a voxel
  protected columnArray: Array<Array<Array<boolean>>> = [];

  //Array of beams along the width of the frame
  protected beamAlongWidthArray: Array<Array<Array<boolean>>> = [];
  protected beamAlongDepthArray: Array<Array<Array<boolean>>> = [];

  // Regenerate the frame, can be called by the UI
  TriggerRegeneration() {
    if(this.animateRegeneration)
      this.TriggerRegerateWithAnimation();
    else
      this.TriggerRegenerateWithoutAnimation();
  }

  // Regenerate the frame
  // Can be called by the UI directly if animation is turned off
  public TriggerRegenerateWithoutAnimation() 
  {
    if(this.isAnimating)
      return;

    this.Regenerate();

    this.timeSinceLastRegeneration = 0;
  }

  // Regenerate the frame (for internal processes)
  private Regenerate() 
  {
    //Remove all children from the parent mesh
    this.RemoveChildren(this.structureParentObj);
    this.RemoveChildren(this.baseParentObj);

    // Reset the position of the parent mesh and its children
    this.hostObj.position.set(0,0,0);
    this.structureParentObj.position.set(0,0,0);
    this.baseParentObj.position.set(0,0,0);

    // Regenerate the array and create the cubes
    this.voxelArray = this.GenerateArray(this.widthSize, this.heightSize, this.depthSize);
    this.columnArray = this.GenerateArray(this.widthSize + 1, this.heightSize, this.depthSize + 1);
    this.beamAlongWidthArray = this.GenerateArray(this.widthSize, this.heightSize, this.depthSize + 1);
    this.beamAlongDepthArray = this.GenerateArray(this.widthSize + 1, this.heightSize, this.depthSize);

    //Randomise the array
    this.Randomise_SomeChunks(0.35);
    this.CalculateBoundingBox();

    this.DrawStructure();

    this.CentreParentMesh();
  }

  // Animation settings
  private Anim_Distance() : number { return 100;}
  private Anim_Randomness() : number { return 100;}
  private Anim_Leave_Duration_Stagger() : number { return this.heightSize * 1000;} //the time difference between the first and last object to leave
  private Anim_Leave_Duration_Moving() : number { return  500;} //the time it takes for an object to move
  private Anim_RegenerateLeave_Delay() : number { return this.Anim_Leave_Duration_Stagger() + this.Anim_Leave_Duration_Moving() + this.Anim_Randomness() + 100; }
  private Anim_Enter_Duration_Stagger() : number { return this.heightSize * 1000; }//the time difference between the first and last object to enter
  private Anim_Enter_Duration_Moving() : number { return 500; }//the time it takes for an object to move
  private Anim_RegenerateEnter_Delay() : number { return this.Anim_Enter_Duration_Stagger() + this.Anim_Enter_Duration_Moving() + this.Anim_Randomness() + 100; }

  // Regenerate the frame with an animation
  // Can be called by the UI directly if animation is turned on
  public TriggerRegerateWithAnimation() {

    // If the animation is already running, do nothing
    if(this.isAnimating)
      return;
    
    this.isAnimating = true;
    const children = this.structureParentObj.children;

    // Calculate the centre of each object (yPos is the centre of the object in the y direction)
    // and the min and max y values of the bounding box
    let boxMinY : number = Number.MAX_VALUE;
    let boxMaxY : number = Number.MIN_VALUE;
    const yPosArray: number[] = [];
    for (let i = 0; i < children.length; i++) {

      const box = new THREE.Box3().setFromObject(children[i]);
      const childCenter = box.getCenter(new THREE.Vector3());
      yPosArray.push(childCenter.y);

      if(box.min.y < boxMinY)
        boxMinY = box.min.y;
      if(box.max.y > boxMaxY)
        boxMaxY = box.max.y;
    }
    
    //Make each object leave
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const initialPosition = child.position.clone();
      const yPos = yPosArray[i];

      const randomValue = Math.random() * this.Anim_Randomness();
      const delay = (boxMaxY - yPos) / (boxMaxY - boxMinY) * this.Anim_Leave_Duration_Stagger() + randomValue;

      const targetPosition = new THREE.Vector3(initialPosition.x, initialPosition.y + this.Anim_Distance(), initialPosition.z);
      new TWEEN.Tween(child.position)
        .delay(delay)
        .to(targetPosition, this.Anim_Leave_Duration_Moving())
        .easing(TWEEN.Easing.Elastic.InOut)
        .start()
    }

    setTimeout(() => {
      this.RegenerateAndAnimateIn();
    }, this.Anim_RegenerateLeave_Delay());
  }

  // Regenerate the frame and animate in
  // Called after the leave animation is complete
  private RegenerateAndAnimateIn() {  

    // Remove all children from the parent mesh
    this.Regenerate();

    // Leave animation
    const children = this.structureParentObj.children;
    // Calculate the centre of each object (yPos is the centre of the object in the y direction)
    // and the min and max y values of the bounding box
    let boxMinY : number = Number.MAX_VALUE;
    let boxMaxY : number = Number.MIN_VALUE;
    const yPosArray: number[] = [];
    for (let i = 0; i < children.length; i++) {
      const box = new THREE.Box3().setFromObject(children[i]);
      const childCenter = box.getCenter(new THREE.Vector3());
      yPosArray.push(childCenter.y);

      if(box.min.y < boxMinY)
        boxMinY = box.min.y;
      if(box.max.y > boxMaxY)
        boxMaxY = box.max.y;
    }

    // Enter animation
    for (let i = 0; i < children.length; i++) 
    {
      const child = children[i];
      const desiredPosition = child.position.clone();
      const yPos = yPosArray[i];
      const randomValue = Math.random() * this.Anim_Randomness();
      const delay = (yPos - boxMinY) / (boxMaxY - boxMinY) * this.Anim_Enter_Duration_Stagger() + randomValue;
      
      //Set pre-motion position
      child.position.set(desiredPosition.x, desiredPosition.y + this.Anim_Distance(), desiredPosition.z);

      new TWEEN.Tween(child.position)
        .delay(delay)
        .to(desiredPosition, this.Anim_Enter_Duration_Moving())
        .easing(TWEEN.Easing.Quadratic.InOut)
        .start()
    }

    setTimeout(() => {
      this.RegenerateComplete();
    }, this.Anim_RegenerateEnter_Delay());

  }

  // Called when the regeneration is complete to unfreese regenerations
  RegenerateComplete() {
    this.isAnimating = false;
    this.timeSinceLastRegeneration = 0;
  }


  // Remove all children from an object
  RemoveChildren(obj: THREE.Object3D)
  {
    let childrenToRemove: THREE.Object3D[] = [];

    obj.children.forEach(child => {
      childrenToRemove.push(child);
    });

    childrenToRemove.forEach(child => {
      obj.remove(child);
    });
  }

  // Generate a 3D array of booleans
  GenerateArray(width: number, height: number, depth: number) : Array<Array<Array<boolean>>>
  {
    const array: Array<Array<Array<boolean>>> = [];
    for (let i = 0; i < width; i++) {
      const layer: Array<Array<boolean>> = [];
      for (let j = 0; j < height; j++) {
        const row: Array<boolean> = [];
        for (let k = 0; k < depth; k++) {
          row.push(false);
        }
        layer.push(row);
      }
      array.push(layer);
    }

    return array;
  }

  //Set a voxel in the array to TRUE (i.e. filled)
  FlagVoxel(x: number, y: number, z: number)
  {
    this.voxelArray[x][y][z] = true;
    this.columnArray[x][y][z] = true;
    this.columnArray[x+1][y][z] = true;
    this.columnArray[x][y][z+1] = true;
    this.columnArray[x+1][y][z+1] = true;
    this.beamAlongWidthArray[x][y][z] = true;
    this.beamAlongWidthArray[x][y][z+1] = true;
    this.beamAlongDepthArray[x][y][z] = true;
    this.beamAlongDepthArray[x+1][y][z] = true;
  }

  // Randomise the voxels in the RCFrame and regenerate
  Randomise_All() 
  {  
    for (let i = 0; i < this.widthSize; i++) {
      for (let j = 0; j < this.heightSize; j++) {
        for (let k = 0; k < this.depthSize; k++) {
          if(Math.random() < 0.5)
          {
            this.FlagVoxel(i,j,k);
          }
          //this.voxelArray[i][j][k] = Math.random() < 0.5;
        }
      }
    }
  }

  // Find the total number of filled voxels in the array
  SumArray() : number
  {
    let sum = 0;
    for (let i = 0; i < this.widthSize; i++) {
      for (let j = 0; j < this.heightSize; j++) {
        for (let k = 0; k < this.depthSize; k++) {
          sum += this.voxelArray[i][j][k] ? 1 : 0;
        }
      }
    }
    return sum;
  }

  // Adds random chunks to the frame until the sum of the array is greater than limitProportion
  Randomise_SomeChunks(limitProportion: number)
  {
    //if the sum of the array is less than half of the total size, randomise some chunks

    const limit = this.widthSize * this.heightSize * this.depthSize * limitProportion;

    //First draw a block which is the full height of the frame
    const makeMinWidth2 = Math.random() < 0.5;
    this.Randomise_Chunk(this.GetRandomInt(makeMinWidth2 ? 2 : 1,this.widthSize * 0.7), this.heightSize, this.GetRandomInt(makeMinWidth2 ? 1 : 2,this.depthSize * 0.7));

    while (this.SumArray() < limit) 
    {
      //Create random chunks which are not the full height of the frame
      this.Randomise_Chunk(this.GetRandomInt(1,this.widthSize), this.GetRandomInt(1,this.heightSize * 0.7), this.GetRandomInt(1,this.depthSize));
    }

  }

  // Creates a block of filled voxels in the array
  Randomise_Chunk(width: number, height: number, depth: number)
  {
    let x = this.GetRandomInt(0, this.widthSize - width - 1);
    //let y = this.getRandomInt(0, this.heightSize - height - 1);
    let z = this.GetRandomInt(0, this.depthSize - depth - 1);

    for (let i = x; i < x + width; i++) {
      for (let j = 0; j < height; j++) {
        for (let k = z; k < z + depth; k++) {
          this.FlagVoxel(i,j,k);
        }
      }
    }
  }

  // Get a random integer between x and y
  GetRandomInt(x: number, y: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    return Math.floor(Math.random() * (y - x + 1)) + x;
  }

  //Override this method in child classes to define the specific drawing logic
  DrawStructure() {
    // Override this method in child classes to define the specific drawing logic
  }

  protected box: THREE.Box3 = new THREE.Box3();
  protected center: THREE.Vector3 = new THREE.Vector3();
  protected size: THREE.Vector3 = new THREE.Vector3();

  // Calculate the bounding box of the voxel array
  CalculateBoundingBox() {  
    // Calculate the bounding box of the parent mesh and its children
    this.box = new THREE.Box3();
    // Calculate the bounding box according to the voxel array...
    // Using the parentObj is not working...
    for (let i = 0; i < this.widthSize; i++) {
      for (let j = 0; j < this.heightSize; j++) {
        for (let k = 0; k < this.depthSize; k++) {
          if (this.voxelArray[i][j][k]) {
            this.box.expandByPoint(new THREE.Vector3((i+0.5)*this.unitWidth, j*this.unitHeight, (k+0.5)*this.unitDepth));
            this.box.expandByPoint(new THREE.Vector3((i-0.5)*this.unitWidth, (j-1)*this.unitHeight, (k-0.5)*this.unitDepth));
          }
        }
      }
    }

    // // Get the center of the bounding box
    this.center = this.box.getCenter(new THREE.Vector3());
    this.size = this.box.getSize(new THREE.Vector3());

  }

  // Centre the parent mesh in the host mesh
  // and adjust the camera position
  CentreParentMesh() {

    // Subtract the center of the bounding box from the position of the parent mesh
    this.structureParentObj.position.sub(this.center);
    this.baseParentObj.position.sub(this.center);

    // Get the maximum side of the bounding box (used to determine distance)
    let maxDim = Math.max(this.size.x, this.size.y, this.size.z);

    // Set the camera to look at the center of the bounding box
    //camera.lookAt(center);
    
    // Set the camera to be at the maximum side of the bounding box
    const cameraZ = Math.max(maxDim*1.2, 1.5);
    this.camera.position.z = cameraZ;
    this.camera.position.y = this.size.y;
    this.camera.lookAt(this.hostObj.position);
    
  }

  private lastTime : number = 0;
  private timeDelta : number = 0;

  //ANIMATE
  animate(time: number = 0) {
    requestAnimationFrame(this.animate.bind(this))

    // Increment by a timestep
    this.timeDelta = (time - this.lastTime)/1000;
    this.timeSinceLastRegeneration += this.timeDelta;
    this.lastTime = time; 

    // Regenerate the frame if the time since the last regeneration is greater than the regeneration interval
    if(this.regenerationLoop && this.timeSinceLastRegeneration > this.regenerationInterval){
      this.TriggerRegeneration();
    }


    if (!this.pauseRotation)
      this.hostObj.rotation.y += 0.007

    TWEEN.update()

    this.renderer.render(this.scene, this.camera)

    //stats.update()
  }
}

export class RCFrame extends FrameBase {

  //materialCube = new THREE.MeshBasicMaterial({color: 0xff0000, side: THREE.DoubleSide  });
  //materialCube = new THREE.MeshBasicMaterial({ color: 0x808080 });
  materialCube = new THREE.MeshLambertMaterial({ color: 0xCCCCCC });

  slabDepthRelative: number = 0.2;
  columnWidthRelative: number = 0.1;

  DrawStructure() {
    //DRAW SLABS
    const slabGeom = new THREE.BoxGeometry(this.unitWidth * (1+this.columnWidthRelative), this.unitHeight * this.slabDepthRelative,this.unitDepth*(1+this.columnWidthRelative))
    for (let j = 0; j < this.heightSize; j++) {
      let slabsOnThisLevel = [];
      for (let i = 0; i < this.widthSize; i++) {
        for (let k = 0; k < this.depthSize; k++) {
          if (this.voxelArray[i][j][k]) {
            const cloneGeometry = slabGeom.clone()
            cloneGeometry.translate(i*this.unitWidth, j*this.unitHeight, k*this.unitDepth)
            slabsOnThisLevel.push(cloneGeometry);

          }
        }
      }
      let mergedGeometry =  BufferGeometryUtils.mergeGeometries(slabsOnThisLevel)
      const cube = new THREE.Mesh(mergedGeometry, this.materialCube)
      this.structureParentObj.add(cube)
    }

    //DRAW SLABS ON THE BOTTOM
    const gfSlabGeom = new THREE.BoxGeometry(this.unitWidth * (1+this.columnWidthRelative*2), this.unitHeight * this.slabDepthRelative,this.unitDepth*(1+this.columnWidthRelative*2))
    for (let i = 0; i < this.widthSize; i++) {
      for (let k = 0; k < this.depthSize; k++) {
        if (this.voxelArray[i][0][k]) {
          const cloneGeometry = gfSlabGeom.clone()
          cloneGeometry.translate(i*this.unitWidth, -this.unitHeight, k*this.unitDepth)
          const cube = new THREE.Mesh(cloneGeometry, this.materialCube)
          this.baseParentObj.add(cube)
        }
      }
    }

    //DRAW COLUMNS
    const columnGeom = new THREE.BoxGeometry(this.unitWidth * this.columnWidthRelative, this.unitHeight,this.unitDepth * this.columnWidthRelative)
    for (let i = 0; i < this.widthSize + 1; i++) {
      for (let j = 0; j < this.heightSize; j++) {
        for (let k = 0; k < this.depthSize + 1; k++) {
          if (this.columnArray[i][j][k]) {
            const cloneGeometry = columnGeom.clone()
            cloneGeometry.translate((i-0.5)*this.unitWidth, (j-0.5)*this.unitHeight, (k-0.5)*this.unitDepth)
            const cube = new THREE.Mesh(cloneGeometry, this.materialCube)
            this.structureParentObj.add(cube)
          }
        }
      }
    }

  }
}

export class TimberFrame extends FrameBase {

  materialFrame = new THREE.MeshLambertMaterial({ color: 0xfad6a5 });
  materialSlab = new THREE.MeshLambertMaterial({ color: 0xffe4c4 });
  materialGFSlab = new THREE.MeshLambertMaterial({ color: 0xCCCCCC });

  slabDepthRelative: number = 0.1;
  gfSlabDepthRelative: number = 0.2;
  beamDepthRelative: number = 0.22;
  columnWidthRelative: number = 0.1;

  DrawStructure() {
    //DRAW SLABS
    let slabGeom = new THREE.BoxGeometry(this.unitWidth * (1-this.columnWidthRelative), this.unitHeight * this.slabDepthRelative,this.unitDepth*(1-this.columnWidthRelative))
    for (let i = 0; i < this.widthSize; i++) {
      for (let j = 0; j < this.heightSize; j++) {
        for (let k = 0; k < this.depthSize; k++) {
          if (this.voxelArray[i][j][k]) {
            const cloneGeometry = slabGeom.clone()
            cloneGeometry.translate(i*this.unitWidth, (j-this.slabDepthRelative/2)*this.unitHeight, k*this.unitDepth)
            const cube = new THREE.Mesh(cloneGeometry, this.materialSlab)
            cube.position.set(0,0,0);
            this.structureParentObj.add(cube)
          }
        }
      }
    }

    //DRAW SLABS ON THE BOTTOM
    const gfSlabGeom = new THREE.BoxGeometry(this.unitWidth * (1+this.columnWidthRelative*2), this.unitHeight * this.gfSlabDepthRelative,this.unitDepth*(1+this.columnWidthRelative*2))
    for (let i = 0; i < this.widthSize; i++) {
      for (let k = 0; k < this.depthSize; k++) {
        if (this.voxelArray[i][0][k]) {
          const cloneGeometry = gfSlabGeom.clone()
          cloneGeometry.translate(i*this.unitWidth, -this.unitHeight-this.gfSlabDepthRelative, k*this.unitDepth)
          const cube = new THREE.Mesh(cloneGeometry, this.materialGFSlab)
          this.baseParentObj.add(cube)
        }
      }
    }

    //DRAW COLUMNS
    let columnGeom = new THREE.BoxGeometry(this.unitWidth * this.columnWidthRelative, (1)*this.unitHeight,this.unitDepth * this.columnWidthRelative)
    for (let i = 0; i < this.widthSize + 1; i++) {
      for (let j = 0; j < this.heightSize; j++) {
        for (let k = 0; k < this.depthSize + 1; k++) {
          if (this.columnArray[i][j][k]) {
            const cloneGeometry = columnGeom.clone()
            cloneGeometry.translate((i-0.5)*this.unitWidth, (j-0.5)*this.unitHeight, (k-0.5)*this.unitDepth)
            const cube = new THREE.Mesh(cloneGeometry, this.materialFrame)
            this.structureParentObj.add(cube)
          }
        }
      }
    }
    
    
    //DRAW BEAMS
    const beamGeomAlongWidth = new THREE.BoxGeometry(this.unitWidth * (1-this.columnWidthRelative), this.unitHeight * this.beamDepthRelative,this.unitDepth*(this.columnWidthRelative))
    for (let i = 0; i < this.widthSize; i++) {
      for (let j = 0; j < this.heightSize; j++) {
        for (let k = 0; k < this.depthSize + 1; k++) {
          if (this.beamAlongWidthArray[i][j][k]) {
            const cloneGeometry = beamGeomAlongWidth.clone()
            cloneGeometry.translate((i)*this.unitWidth, (j-this.beamDepthRelative/2)*this.unitHeight, (k-0.5)*this.unitDepth)
            const cube = new THREE.Mesh(cloneGeometry, this.materialFrame)
            this.structureParentObj.add(cube)
          }
        }
      }
    }
    
    const beamGeomAlongDepth = new THREE.BoxGeometry(this.unitWidth * (this.columnWidthRelative), this.unitHeight * this.beamDepthRelative,this.unitDepth*(1-this.columnWidthRelative))
    for (let i = 0; i < this.widthSize + 1; i++) {
      for (let j = 0; j < this.heightSize; j++) {
        for (let k = 0; k < this.depthSize; k++) {
          if (this.beamAlongDepthArray[i][j][k]) {
            const cloneGeometry = beamGeomAlongDepth.clone()
            cloneGeometry.translate((i-0.5)*this.unitWidth, (j-this.beamDepthRelative/2)*this.unitHeight, (k)*this.unitDepth)
            const cube = new THREE.Mesh(cloneGeometry, this.materialFrame)
            this.structureParentObj.add(cube)
          }
        }
      }
    }

  }
}

// How to use the frame
// var frame = new RCFrame("elementId")
// var frame = new TimberFrame("elementId")
// frame.Regenerate();
