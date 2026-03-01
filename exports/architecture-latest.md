
# Documento Técnico - WordPress HA Oficial

Projeto: builder-project
Região: sa-east-1

## Arquitetura
- Route 53
- CloudFront + WAF
- S3 (Assets estáticos)
- ALB + Auto Scaling EC2
- ElastiCache Memcached
- RDS Multi-AZ
- EFS compartilhado
- 2 NAT Gateways

## Custos

- EC2: USD 223.38
- RDS: USD 337.26
- EFS: USD 60.80
- ELASTICACHE: USD 178.12
- NAT: USD 94.90
- ALB: USD 24.09
- CLOUDFRONT: USD 483.38
- S3: USD 0.00
- WAF: USD 0.00
- ROUTE53: USD 0.00

TOTAL MENSAL ESTIMADO: USD 1401.93
