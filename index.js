const express = require("express");
const { PricingClient, GetProductsCommand } = require("@aws-sdk/client-pricing");

const app = express();
const port = 3000;

const client = new PricingClient({ region: "us-east-1" });

// =============================
// EC2
// =============================
async function getEC2Price(instanceType) {
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

  if (!product) throw new Error("EC2 não encontrado");

  const terms = product.terms.OnDemand;
  const priceDimensions = Object.values(terms)[0].priceDimensions;
  const pricePerHour = Object.values(priceDimensions)[0].pricePerUnit.USD;

  return (parseFloat(pricePerHour) * 730).toFixed(2);
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

  if (!product) throw new Error("RDS não encontrado");

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

  const storageProduct = regionProducts.find(p => {
    const usageType = p.product.attributes.usagetype || "";
    return usageType.includes("TimedStorage");
  });

  if (!storageProduct) throw new Error("EFS não encontrado");

  const terms = storageProduct.terms.OnDemand;
  const priceDimensions = Object.values(terms)[0].priceDimensions;
  const pricePerGB = Object.values(priceDimensions)[0].pricePerUnit.USD;

  return (parseFloat(pricePerGB) * storageGB).toFixed(2);
}

// =============================
// NAT FIXO
// =============================
function getNATPrice(quantity) {
  const natHourlyUSD = 0.065;
  const monthly = natHourlyUSD * 730 * quantity;
  return monthly.toFixed(2);
}

// =============================
// ALB FIXO
// =============================
function getALBPrice(quantity) {
  const albHourly = 0.025;
  const lcuHourly = 0.008;

  const monthly = (albHourly + lcuHourly) * 730 * quantity;
  return monthly.toFixed(2);
}

// =============================
// ROTA
// =============================
app.get("/architecture", async (req, res) => {
  try {
    const ec2Type = req.query.ec2 || "m6i.large";
    const rdsType = req.query.rds || "db.m6i.large";
    const efsGB = parseInt(req.query.efs) || 200;
    const natQty = parseInt(req.query.nat) || 2;
    const albQty = parseInt(req.query.alb) || 1;

    const ec2Single = await getEC2Price(ec2Type);
    const ec2Monthly = (parseFloat(ec2Single) * 2).toFixed(2);

    const rdsMonthly = await getRDSPrice(rdsType);
    const efsMonthly = await getEFSPrice(efsGB);
    const natMonthly = getNATPrice(natQty);
    const albMonthly = getALBPrice(albQty);

    const total = (
      parseFloat(ec2Monthly) +
      parseFloat(rdsMonthly) +
      parseFloat(efsMonthly) +
      parseFloat(natMonthly) +
      parseFloat(albMonthly)
    ).toFixed(2);

    res.json({
      region: "sa-east-1",
      ec2MonthlyUSD: ec2Monthly,
      rdsMonthlyUSD: rdsMonthly,
      efsMonthlyUSD: efsMonthly,
      natMonthlyUSD: natMonthly,
      albMonthlyUSD: albMonthly,
      totalMonthlyUSD: total
    });

  } catch (error) {
    console.error("ERRO REAL:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`CloudEstimate rodando em http://localhost:${port}`);
});