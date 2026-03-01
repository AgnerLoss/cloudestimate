const express = require("express");
const { PricingClient, GetProductsCommand } = require("@aws-sdk/client-pricing");

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static("public"));

const client = new PricingClient({ region: "us-east-1" });

/* =======================================================
   FUNÇÕES DE PREÇO
======================================================= */

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

  if (!product) return 0;

  const terms = product.terms.OnDemand;
  const priceDimensions = Object.values(terms)[0].priceDimensions;
  const pricePerHour = Object.values(priceDimensions)[0].pricePerUnit.USD;

  return parseFloat(pricePerHour) * 730 * quantity;
}

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

  if (!product) return 0;

  const terms = product.terms.OnDemand;
  const priceDimensions = Object.values(terms)[0].priceDimensions;
  const pricePerHour = Object.values(priceDimensions)[0].pricePerUnit.USD;

  return parseFloat(pricePerHour) * 730;
}

function getNATPrice(quantity) {
  return 0.065 * 730 * quantity;
}

/* =======================================================
   ROTA PRINCIPAL
======================================================= */

app.post("/architecture", async (req, res) => {
  try {

    const arch = req.body;

    let breakdown = {
      ec2: 0,
      rds: 0,
      nat: 0
    };

    /* =========================
       EC2 (ARRAY SEGURO)
    ========================== */

    if (
      arch.compute &&
      Array.isArray(arch.compute.ec2) &&
      arch.compute.ec2.length > 0
    ) {
      for (const instance of arch.compute.ec2) {

        if (!instance.instanceType || !instance.minInstances) continue;

        const cost = await getEC2Price(
          instance.instanceType,
          instance.minInstances
        );

        breakdown.ec2 += cost;
      }
    }

    /* =========================
       RDS
    ========================== */

    if (
      arch.database &&
      arch.database.rds &&
      arch.database.rds.instanceType
    ) {
      breakdown.rds = await getRDSPrice(
        arch.database.rds.instanceType
      );
    }

    /* =========================
       NAT FIXO (2)
    ========================== */

    breakdown.nat = getNATPrice(2);

    /* =========================
       TOTAL
    ========================== */

    const total =
      breakdown.ec2 +
      breakdown.rds +
      breakdown.nat;

    res.json({
      breakdown: {
        ec2: breakdown.ec2.toFixed(2),
        rds: breakdown.rds.toFixed(2),
        nat: breakdown.nat.toFixed(2)
      },
      totalMonthlyUSD: total.toFixed(2)
    });

  } catch (error) {
    console.error("ERRO REAL:", error);
    res.status(500).json({ error: error.message });
  }
});

/* =======================================================
   START
======================================================= */

app.listen(port, () => {
  console.log(`CloudEstimate v1 rodando em http://localhost:${port}`);
});