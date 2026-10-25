'use strict';

// Render solid geometry in the map's WebGL scene, not a flattened HTML marker.
window.createBusLayer = function createBusLayer() {
  let map, program, buffer, positionAttribute, colorAttribute, matrixUniform, vertexArray;
  let location = null;
  let heading = 0;
  let vertexCount = 0;
  const vertices = [];
  function box(cx, cy, cz, length, width, height, color) {
    const x = length / 2, y = width / 2, z = height / 2;
    const corners = [[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]];
    const faces = [[4,5,6,7,1],[0,3,2,1,.45],[0,1,5,4,.65],[1,2,6,5,.8],[2,3,7,6,.9],[3,0,4,7,.6]];
    for (const [a,b,c,d,light] of faces) {
      for (const index of [a,b,c,a,c,d]) {
        const p = corners[index];
        vertices.push(p[0]+cx,p[1]+cy,p[2]+cz,...color.map(value => value * light));
      }
    }
  }
  box(0,0,1.9,12,2.7,2.8,[.07,.43,.27]);
  box(0,0,3.25,12,2.7,.35,[.95,.96,.86]);
  box(0,0,2.65,11.7,2.78,1,[.08,.22,.26]);
  box(0,0,1.95,12.05,2.8,.18,[.97,.95,.82]);
  box(0,0,.95,12.05,2.75,.15,[.95,.69,.22]);
  for (const x of [-4,-2,0,2,4]) {
    box(x,0,2.65,.12,2.83,1.05,[.88,.92,.82]);
  }
  box(-1.8,0,3.6,2.2,1.6,.35,[.68,.74,.66]);
  box(2,0,3.6,2.2,1.6,.35,[.68,.74,.66]);
  for (const x of [-3.8,3.8]) {
    for (const y of [-1.45,1.45]) {
      // Twelve-sided tires remain visibly round at the map model's display size.
      const segments = 12;
      for (let i=0;i<segments;i++) {
        const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
        for (const side of [-.22,.22]) {
          for (const p of [[x,y+side,.65],[x+Math.cos(a)*.65,y+side,.65+Math.sin(a)*.65],[x+Math.cos(b)*.65,y+side,.65+Math.sin(b)*.65]]) {
            vertices.push(...p,.09,.12,.11);
          }
        }
        const p1=[x+Math.cos(a)*.65,.65+Math.sin(a)*.65],p2=[x+Math.cos(b)*.65,.65+Math.sin(b)*.65];
        for (const p of [[p1[0],y-.22,p1[1]],[p2[0],y-.22,p2[1]],[p2[0],y+.22,p2[1]],[p1[0],y-.22,p1[1]],[p2[0],y+.22,p2[1]],[p1[0],y+.22,p1[1]]]) vertices.push(...p,.13,.16,.14);
      }
      box(x,y,.65,.5,.48,.5,[.65,.7,.67]);
    }
  }
  for (const y of [-.9,.9]) {
    box(6.04,y,1.1,.1,.42,.25,[1,.88,.46]);
    box(-6.04,y,1.1,.1,.35,.35,[.85,.12,.09]);
  }
  return {
    id: 'solid-bus', type: 'custom', renderingMode: '3d',
    onAdd(instance, gl) {
      map = instance;
      function shader(type, source) {
        const result = gl.createShader(type);
        gl.shaderSource(result, source);
        gl.compileShader(result);
        if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
        return result;
      }
      const vertex = shader(gl.VERTEX_SHADER, 'attribute vec3 a_position; attribute vec3 a_color; uniform mat4 u_matrix; varying vec3 v_color; void main(){gl_Position=u_matrix*vec4(a_position,1.0);v_color=a_color;}');
      const fragment = shader(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec3 v_color; void main(){gl_FragColor=vec4(v_color,1.0);}');
      program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      positionAttribute = gl.getAttribLocation(program,'a_position');
      colorAttribute = gl.getAttribLocation(program,'a_color');
      matrixUniform = gl.getUniformLocation(program,'u_matrix');
      const previousBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
      vertexCount = vertices.length/6;
      vertexArray = gl.createVertexArray();
      const previousVertexArray = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
      gl.bindVertexArray(vertexArray);
      gl.enableVertexAttribArray(positionAttribute);
      gl.enableVertexAttribArray(colorAttribute);
      gl.vertexAttribPointer(positionAttribute,3,gl.FLOAT,false,24,0);
      gl.vertexAttribPointer(colorAttribute,3,gl.FLOAT,false,24,12);
      gl.bindVertexArray(previousVertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER,previousBuffer);
    },
    setPosition(lngLat, bearing) {
      location = lngLat;
      heading = bearing;
      if (map) map.triggerRepaint();
    },
    render(gl, matrix) {
      if (!location) return;
      const origin = maplibregl.MercatorCoordinate.fromLngLat(location,0);
      // Enlarge only the symbol at regional zoom; its anchor stays on the road.
      const metersPerPixel=40075016.686*Math.cos(location[1]*Math.PI/180)/(512*Math.pow(2,map.getZoom()));
      // Preserve the larger 72px regional symbol, but use physical size up close.
      const scale=origin.meterInMercatorCoordinateUnits()*Math.max(1,metersPerPixel*72/12);
      const angle=heading*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
      const model=[cos*scale,-sin*scale,0,0,-sin*scale,-cos*scale,0,0,0,0,scale,0,origin.x,origin.y,origin.z,1];
      const combined=new Float32Array(16);
      for(let col=0;col<4;col++) for(let row=0;row<4;row++) {
        let value=0;
        for(let k=0;k<4;k++) value+=matrix[k*4+row]*model[col*4+k];
        combined[col*4+row]=value;
      }
      const previous = {
        program: gl.getParameter(gl.CURRENT_PROGRAM),
        vertexArray: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
        depthRange: gl.getParameter(gl.DEPTH_RANGE),
        depthFunc: gl.getParameter(gl.DEPTH_FUNC),
        depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
        clearDepth: gl.getParameter(gl.DEPTH_CLEAR_VALUE),
        capabilities: [gl.DEPTH_TEST,gl.STENCIL_TEST,gl.CULL_FACE,gl.BLEND].map(capability => [capability,gl.isEnabled(capability)])
      };
      gl.useProgram(program);
      gl.bindVertexArray(vertexArray);
      gl.uniformMatrix4fv(matrixUniform,false,combined);
      // The raster basemap uses a restricted depth range; give this solid model
      // its own depth pass so its faces occlude correctly above the road.
      gl.depthRange(0,1);
      gl.depthMask(true);
      gl.clearDepth(1);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLES,0,vertexCount);
      gl.bindVertexArray(previous.vertexArray);
      gl.useProgram(previous.program);
      gl.depthRange(...previous.depthRange);
      gl.depthFunc(previous.depthFunc);
      gl.depthMask(previous.depthMask);
      gl.clearDepth(previous.clearDepth);
      for (const [capability, enabled] of previous.capabilities) {
        if (enabled) gl.enable(capability);
        else gl.disable(capability);
      }
    },
    onRemove(instance,gl) {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteVertexArray(vertexArray);
    }
  };
};
