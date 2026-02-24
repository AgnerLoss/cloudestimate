const express = require("express");
const fs = require("fs");
const path = require("path");
const { PricingClient, GetProductsCommand } = require("@aws-sdk/client-pricing");

const app = express();
const port = 3000;

app.use(express.json());

const client = new PricingClient({ region: "us-east-1" });

// =============================
// EC2
// =============================
async function getEC2Price(instanceType, quantity) {
  const command = new GetProductsCommand({
    ServiceCode: "AmazonEC2",
    Filters: [
      { Type: "TERM_MATCH", Field: "instanceType", Value: instanceType },
      { Type: "TERM_MATCH", Field: "operatingSystem", Value: "Linux" },
      { Type: "TERM_MATCH", Field: "tenancy", Value: "Shared" },
      { Type: "TERM_MATCH", Field: "preInstalledSw", Value: "NA" },
      { Type: "TERM_MATCH", Field: "capacitystatus", Value: "Used" }
    ],
    MaxResults: 50
  });

  const response = await client.send(command);
  const products = response.PriceList.map(p => JSON.parse(p));
  const product = products.find(
    p => p.product.attributes.regionCode === "sa-east-1"
  );

  const terms = product.terms.OnDemand;
  const priceDimensions = Object.values(terms)[0].priceDimensions;
  const pricePerHour = Object.values(priceDimensions)[0].pricePerUnit.USD;

  return (parseFloat(pricePerHour) * 730 * quantity).toFixed(2);
}

// =============================
// RDS
// =============================
async function getRDSPrice(instanceType) {
  const command = new GetProductsCommand({
    ServiceCode: "AmazonRDS",
    Filters: [
      { Type: "TERM_MATCH", Field: "instanceType", Value: instanceType },
      { Type: "TERM_MATCH", Field: "databaseEngine", Value: "MySQL" },
      { Type: "TERM_MATCH", Field: "deploymentOption", Value: "Multi-AZ" }
    ],
    MaxResults: 50
  });

  const response = await client.send(command);
  const products = response.PriceList.map(p => JSON.parse(p));
  const product = products.find(
    p => p.product.attributes.regionCode === "sa-east-1"
  );

  const terms = product.terms.OnDemand;
  const priceDimensions = Object.values(terms)[0].priceDimensions;
  const pricePerHour = Object.values(priceDimensions)[0].pricePerUnit.USD;

  return (parseFloat(pricePerHour) * 730).toFixed(2);
}

// =============================
// EFS
// =============================
async function getEFSPrice(storageGB) {
  const command = new GetProductsCommand({
    ServiceCode: "AmazonEFS",
    MaxResults: 100
  });

  const response = await client.send(command);
  const products = response.PriceList.map(p => JSON.parse(p));

  const regionProducts = products.filter(
    p => p.product.attributes.regionCode === "sa-east-1"
  );

  const storageProduct = regionProducts.find(p =>
    (p.product.attributes.usagetype || "").includes("TimedStorage")
  );

  const terms = storageProduct.terms.OnDemand;
  const priceDimensions = Object.values(terms)[0].priceDimensions;
  const pricePerGB = Object.values(priceDimensions)[0].pricePerUnit.USD;

  return (parseFloat(pricePerGB) * storageGB).toFixed(2);
}

function getNATPrice(quantity) {
  return (0.065 * 730 * quantity).toFixed(2);
}

function getALBPrice(quantity) {
  return ((0.025 + 0.008) * 730 * quantity).toFixed(2);
}

// =============================
// GERADOR DOCUMENTO TÉCNICO
// =============================
function generateProfessionalDocument(arch, breakdown, total) {
  return `
# Documento Técnico de Arquitetura
## WordPress Alta Disponibilidade – Região ${arch.region || "sa-east-1"}

Data de geração: ${new Date().toISOString()}

---

## 1. Objetivo
Descrever a arquitetura proposta para hospedagem de aplicação WordPress com alta disponibilidade.

---

## 2. Arquitetura de Rede
- 1 VPC dedicada
- 2 Subnets públicas
- 2 Subnets privadas
- 1 Internet Gateway
- ${arch.nat.quantity} NAT Gateways

---

## 3. Camada de Aplicação
- ${arch.ec2.quantity} EC2 (${arch.ec2.instanceType})
- ALB (${arch.alb.quantity})
- EFS (${arch.efs.storageGB} GB)

---

## 4. Banco de Dados
- RDS Multi-AZ (${arch.rds.instanceType})

---

## 5. Estimativa de Custos

| Serviço | USD |
|----------|------|
| EC2 | ${breakdown.ec2} |
| RDS | ${breakdown.rds} |
| EFS | ${breakdown.efs} |
| NAT | ${breakdown.nat} |
| ALB | ${breakdown.alb} |
| **TOTAL** | **${total}** |

---

Documento gerado automaticamente pelo CloudEstimate.
`;
}

// =============================
// EXPORTAÇÃO
// =============================
function saveDocumentToFile(content) {
  const exportDir = path.join(__dirname, "exports");

  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir);
  }

  const fileName = `architecture-${Date.now()}.md`;
  const filePath = path.join(exportDir, fileName);

  fs.writeFileSync(filePath, content);

  return fileName;
}

// =============================
// ROTA
// =============================
app.post("/architecture", async (req, res) => {
  try {
    const arch = req.body;

    const ec2 = await getEC2Price(arch.ec2.instanceType, arch.ec2.quantity);
    const rds = await getRDSPrice(arch.rds.instanceType);
    const efs = await getEFSPrice(arch.efs.storageGB);
    const nat = getNATPrice(arch.nat.quantity);
    const alb = getALBPrice(arch.alb.quantity);

    const breakdown = { ec2, rds, efs, nat, alb };

    const total = (
      parseFloat(ec2) +
      parseFloat(rds) +
      parseFloat(efs) +
      parseFloat(nat) +
      parseFloat(alb)
    ).toFixed(2);

    const document = generateProfessionalDocument(arch, breakdown, total);
    const fileName = saveDocumentToFile(document);

    res.json({
      breakdown,
      totalMonthlyUSD: total,
      exportedFile: fileName
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`CloudEstimate rodando em http://localhost:${port}`);
});