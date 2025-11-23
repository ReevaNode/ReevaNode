# DevOps AWS para ReevaNode

Este folder replica el `devops_aws_demo` adaptado a la app real (puerto 3001 y nombre `reeva-node`).

## Qué incluye
- `infra/main.tf`: ECR, log group y cluster ECS básicos para Fargate.
- `pipeline/buildspec.yml`: build en CodeBuild que crea/pushea la imagen de ReevaNode con el `Dockerfile` del repo.
- `pipeline/appspec.yaml` y `pipeline/taskdef.json`: definición para CodeDeploy ECS blue/green.
- `scripts/smoke.sh`: chequeo de salud contra `/health`.

## Uso rápido
1) Infra: en `devops/aws/infra` ejecuta `terraform init && terraform apply` (ajusta `aws_region` y `app_name` si quieres).  
2) Task roles: en `taskdef.json` reemplaza `<ACCOUNT_ID>` con tu cuenta e incluye los ARNs de `ecsTaskExecutionRole` y `ecsTaskRole` válidos.  
3) Servicio ECS: crea el servicio Fargate apuntando al cluster `${app_name}-cluster`, con el load balancer que exponga el puerto 3001 y el nombre de contenedor `reeva-web`.  
4) CodePipeline/CodeBuild: usa `devops/aws/pipeline/buildspec.yml` como buildspec. El artifact del build debe publicar `imageDetail.json`, `devops/aws/pipeline/appspec.yaml`, `devops/aws/pipeline/taskdef.json` y `devops/aws/scripts/smoke.sh`.  
5) Smoke test: CodeDeploy debe inyectar `SMOKE_URL` (por ejemplo la URL del ALB) para que `smoke.sh` llame a `${SMOKE_URL}/health`.  

Notas:
- El puerto publicado es 3001; si lo cambias ajusta `appspec.yaml`, `taskdef.json`, el listener del ALB y la variable `PORT` del contenedor.
- El buildspec omite fallar si no hay pruebas configuradas (`npm test` está con fallback).


Test commit Pipeline