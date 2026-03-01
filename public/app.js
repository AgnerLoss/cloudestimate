let model = {
  metadata: {
    projectName: "builder-project",
    region: "sa-east-1"
  },
  network: {
    natGateways: 2
  },
  edge: {
    cloudfront: false
  },
  compute: {
    ec2: []   // AGORA É ARRAY
  },
  database: {
    rds: null
  }
};

let nodeCounter = 0;
let selectedNodeId = null;

function generateId(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
}

function addNode(type) {
  const canvas = document.getElementById("canvas");

  const node = document.createElement("div");
  node.className = "node";
  node.style.left = Math.random() * 400 + "px";
  node.style.top = Math.random() * 300 + "px";
  node.innerText = type.toUpperCase();

  const id = generateId(type);
  node.dataset.id = id;
  node.dataset.type = type;

  node.onclick = () => selectNode(node);

  canvas.appendChild(node);
  makeDraggable(node);

  // =============================
  // EC2 agora vira array real
  // =============================
  if (type === "ec2") {
    model.compute.ec2.push({
      id: id,
      instanceType: "m6i.large",
      minInstances: 2
    });
  }

  if (type === "rds") {
    model.database.rds = {
      id: id,
      instanceType: "db.m6i.large"
    };
  }

  if (type === "cloudfront") {
    model.edge.cloudfront = true;
  }

  autoCalculate();
}

function selectNode(node) {
  selectedNodeId = node.dataset.id;
  const type = node.dataset.type;
  const panel = document.getElementById("configContent");

  if (type === "ec2") {
    const resource = model.compute.ec2.find(r => r.id === selectedNodeId);

    panel.innerHTML = `
      <label>Tipo EC2</label>
      <input value="${resource.instanceType}" 
        oninput="updateEC2Type(this.value)" />
      <label>Quantidade</label>
      <input type="number" value="${resource.minInstances}"
        oninput="updateEC2Qty(this.value)" />
    `;
  }

  if (type === "rds") {
    panel.innerHTML = `
      <label>Tipo RDS</label>
      <input value="${model.database.rds.instanceType}"
        oninput="updateRDSType(this.value)" />
    `;
  }

  if (type === "cloudfront") {
    panel.innerHTML = `<p>CloudFront ativo</p>`;
  }
}

function updateEC2Type(value) {
  const resource = model.compute.ec2.find(r => r.id === selectedNodeId);
  if (resource) {
    resource.instanceType = value;
    autoCalculate();
  }
}

function updateEC2Qty(value) {
  const resource = model.compute.ec2.find(r => r.id === selectedNodeId);
  if (resource) {
    resource.minInstances = parseInt(value) || 1;
    autoCalculate();
  }
}

function updateRDSType(value) {
  if (model.database.rds) {
    model.database.rds.instanceType = value;
    autoCalculate();
  }
}

function makeDraggable(element) {
  let offsetX = 0;
  let offsetY = 0;
  let isDragging = false;

  element.addEventListener("mousedown", (e) => {
    isDragging = true;
    offsetX = e.offsetX;
    offsetY = e.offsetY;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    element.style.left = (e.pageX - offsetX) + "px";
    element.style.top = (e.pageY - offsetY) + "px";
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });
}

async function autoCalculate() {
  try {
    const response = await fetch("/architecture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(model)
    });

    const data = await response.json();
    if (!response.ok) return;

    document.getElementById("result").innerText =
      "USD " + data.totalMonthlyUSD;

  } catch (error) {
    console.log("Erro silencioso");
  }
}

function calculate() {
  autoCalculate();
}