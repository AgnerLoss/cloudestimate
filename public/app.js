async function generateTemplate() {
  const model = {
    metadata: {
      projectName: "wordpress-ha",
      region: "sa-east-1"
    },
    network: {
      natGateways: 2
    },
    edge: {
      cloudfront: true,
      waf: true,
      s3StaticAssets: true
    },
    dns: {
      route53: true
    },
    compute: {
      ec2: {
        instanceType: "m6i.large",
        minInstances: 2
      }
    },
    database: {
      rds: {
        instanceType: "db.m6i.large"
      }
    },
    storage: {
      efs: {
        storageGB: 200
      }
    }
  };

  const response = await fetch("/architecture", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(model)
  });

  const data = await response.json();

  document.getElementById("result").innerText =
    "USD " + data.totalMonthlyUSD;
}