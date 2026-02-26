const express = require("express");
const fs = require("fs");
const path = require("path");
const { PricingClient, GetProductsCommand } = require("@aws-sdk/client-pricing");

const app = express();
const port = 3000;

app.use(express.json());

const client = new PricingClient({ region: "us-east-1" });

/* =============================
   VALIDAÇÃO
============================= */
function validateModel(model) {
  if (!model.metadata?.region) throw new Error("metadata.region é obrigatório");
  if (!model.compute?.ec2) throw new Error("compute.ec2 é obrigatório");
  if (!model.database?.rds) throw new Error("database.rds é obrigatório");
  if (!model.storage?.efs) throw new Error("storage.efs é obrigatório");
}

/* =============================
   AWS PRICING API
============================= */

async function getEC2Price(region, instanceType, quantity) {
  const command = new GetProductsCommand({
    ServiceCode: "AmazonEC2",
    Filters: [
      { Type: "TERM_MATCH", Field: "instanceType", Value: instanceType },
      { Type: "TERM_MATCH", Field: "operatingSystem", Value: "Linux" },
      { Type: "TERM_MATCH", Field: "tenancy", Value: "Shared" },
      { Type: "TERM_MATCH", Field: "preInstalledSw", Value: "NA" }
    ],
    MaxResults: 50
  });

  const response = await client.send(command);
  const products = response.PriceList.map(p => JSON.parse(p));

  const product = products.find(p => p.product.attributes.regionCode === region);
  if (!product) throw new Error("EC2 não encontrado");

  const pricePerHour =
    Object.values(
      Object.values(product.terms.OnDemand)[0].priceDimensions
    )[0].pricePerUnit.USD;

  return (parseFloat(pricePerHour) * 730 * quantity).toFixed(2);
}

async function getRDSPrice(region, instanceType) {
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

  const product = products.find(p => p.product.attributes.regionCode === region);
  if (!product) throw new Error("RDS não encontrado");

  const pricePerHour =
    Object.values(
      Object.values(product.terms.OnDemand)[0].priceDimensions
    )[0].pricePerUnit.USD;

  return (parseFloat(pricePerHour) * 730).toFixed(2);
}

async function getEFSPrice(region, storageGB) {
  const command = new GetProductsCommand({
    ServiceCode: "AmazonEFS",
    MaxResults: 100
  });

  const response = await client.send(command);
  const products = response.PriceList.map(p => JSON.parse(p));

  const product = products.find(
    p =>
      p.product.attributes.regionCode === region &&
      (p.product.attributes.usagetype || "").includes("TimedStorage")
  );

  if (!product) throw new Error("EFS não encontrado");

  const pricePerGB =
    Object.values(
      Object.values(product.terms.OnDemand)[0].priceDimensions
    )[0].pricePerUnit.USD;

  return (parseFloat(pricePerGB) * storageGB).toFixed(2);
}

async function getElastiCachePrice(region) {
  const command = new GetProductsCommand({
    ServiceCode: "AmazonElastiCache",
    Filters: [
      { Type: "TERM_MATCH", Field: "cacheEngine", Value: "Memcached" },
      { Type: "TERM_MATCH", Field: "instanceType", Value: "cache.t4g.medium" }
    ],
    MaxResults: 50
  });

  const response = await client.send(command);
  const products = response.PriceList.map(p => JSON.parse(p));

  const product = products.find(p => p.product.attributes.regionCode === region);
  if (!product) throw new Error("ElastiCache não encontrado");

  const pricePerHour =
    Object.values(
      Object.values(product.terms.OnDemand)[0].priceDimensions
    )[0].pricePerUnit.USD;

  const nodes = 2;
  return (parseFloat(pricePerHour) * 730 * nodes).toFixed(2);
}

/* =============================
   ESTIMATIVAS CONTROLADAS v1
============================= */

function getNATPrice(quantity) {
  return (0.065 * 730 * quantity).toFixed(2);
}

function getALBPrice(quantity) {
  return ((0.025 + 0.008) * 730 * quantity).toFixed(2);
}

function getCloudFrontPrice() {
  const dataTransferGB = 3000;
  const pricePerGB = 0.16;

  const requestsMillions = 4.5;
  const requestUnits = (requestsMillions * 1000000) / 10000;
  const requestCost = requestUnits * 0.0075;

  return (dataTransferGB * pricePerGB + requestCost).toFixed(2);
}

function getS3Price() {
  const storageGB = 100;
  const pricePerGB = 0.023;
  return (storageGB * pricePerGB).toFixed(2);
}

function getWAFPrice() {
  return (25 + 5).toFixed(2); // estimativa simples
}

function getRoute53Price() {
  const hostedZone = 0.5;
  const queries = 0.4;
  return (hostedZone + queries).toFixed(2);
}

/* =============================
   DOCUMENTO
============================= */

function generateDocument(model, breakdown, total) {
  return `
# Documento Técnico - WordPress HA Oficial

Projeto: ${model.metadata.projectName}
Região: ${model.metadata.region}

## Arquitetura
- Route 53
- CloudFront + WAF
- S3 (Assets estáticos)
- ALB + Auto Scaling EC2
- ElastiCache Memcached
- RDS Multi-AZ
- EFS compartilhado
- ${model.network.natGateways} NAT Gateways

## Custos

${Object.entries(breakdown)
  .map(([k, v]) => `- ${k.toUpperCase()}: USD ${v}`)
  .join("\n")}

TOTAL MENSAL ESTIMADO: USD ${total}
`;
}

/* =============================
   EXPORTAÇÃO
============================= */

function saveDocument(content) {
  const dir = path.join(__dirname, "exports");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  const fileName = `architecture-${Date.now()}.md`;
  fs.writeFileSync(path.join(dir, fileName), content);
  return fileName;
}

/* =============================
   ROTA PRINCIPAL
============================= */
app.use(express.static("public"));

app.post("/architecture", async (req, res) => {
  try {
    const model = req.body;
    validateModel(model);

    const region = model.metadata.region;

    const ec2Quantity =
      model.compute.ec2.minInstances ||
      model.compute.ec2.quantity ||
      1;

    const ec2 = await getEC2Price(
      region,
      model.compute.ec2.instanceType,
      ec2Quantity
    );

    const rds = await getRDSPrice(region, model.database.rds.instanceType);
    const efs = await getEFSPrice(region, model.storage.efs.storageGB);
    const elasticache = await getElastiCachePrice(region);

    const nat = getNATPrice(model.network.natGateways || 2);
    const alb = getALBPrice(1);

    const cloudfront = model.edge?.cloudfront ? getCloudFrontPrice() : "0.00";
    const s3 = model.edge?.s3StaticAssets ? getS3Price() : "0.00";
    const waf = model.edge?.waf ? getWAFPrice() : "0.00";
    const route53 = model.dns?.route53 ? getRoute53Price() : "0.00";

    const breakdown = {
      ec2,
      rds,
      efs,
      elasticache,
      nat,
      alb,
      cloudfront,
      s3,
      waf,
      route53
    };

    const total = Object.values(breakdown)
      .reduce((sum, value) => sum + parseFloat(value), 0)
      .toFixed(2);

    const document = generateDocument(model, breakdown, total);
    const fileName = saveDocument(document);

    res.json({
      breakdown,
      totalMonthlyUSD: total,
      exportedFile: fileName
    });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`CloudEstimate v1 rodando em http://localhost:${port}`);
});