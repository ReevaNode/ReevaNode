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
4) Pipeline CI/CD: ver sección siguiente para usar CodePipeline + Lambda como despliegue (sin CodeDeploy).  
5) Smoke test: si quieres validar el ALB externamente, reutiliza `devops/aws/scripts/smoke.sh` apuntando a `${ALB_URL}/health`.  

Notas:
- El puerto publicado es 3001; si lo cambias ajusta `appspec.yaml`, `taskdef.json`, el listener del ALB y la variable `PORT` del contenedor.
- El buildspec omite fallar si no hay pruebas configuradas (`npm test` está con fallback).


## Pipeline actual (CodePipeline + Lambda)

Requisitos previos:
- Repositorio GitHub conectado vía AWS Connector (CodeStar Connection).
- Bucket S3 para artifacts (`reeva-node-artifacts-us-east-1`).
- Repositorio ECR `reeva-node`.
- Roles IAM: `codebuild-reeva-node-role`, `ecsTaskExecutionRole`, `ecsTaskRole`, `reeva-pipeline-lambda-role` (Lambda deploy).

Componentes:
1. **CodePipeline** (`reeva-pipeline`)
   - **Source:** GitHub (IgnaciaHerrera/ReevaNode). Cada commit en `main` dispara la pipeline.
   - **Build:** CodeBuild (`reeva-node-build`) usa `devops/aws/pipeline/buildspec.yml`.  
     - Construye la imagen, la sube a ECR y genera `Reeva_node/imageDetail.json`.
     - Publica un ZIP con `imageDetail.json`, `taskdef.json`, `appspec.yaml` y `scripts/smoke.sh` en `s3://reeva-node-artifacts-us-east-1/reeva-pipeline/BuildArtif/...`.
   - **Deploy:** acción *Invoke* que llama a la Lambda `reeva-pipeline-deploy`.

2. **Lambda deploy (`reeva-pipeline-deploy`)**
   - Descarga el ZIP del artifact (bucket/key vienen en el evento de CodePipeline).
   - Lee `imageDetail.json` para conocer el `ImageURI`.
   - Actualiza `taskdef.json` con esa imagen, registra una nueva revisión y ejecuta `ecs.update_service` en el cluster `reeva-node-cluster2`, servicio `reeva-web-service`.
   - Reporta éxito/fallo usando `codepipeline.put_job_success_result/put_job_failure_result`.

3. **ECS/Fargate**
   - Task definition `reeva-node-task` (log group `/ecs/reeva-node-task`).
   - Servicio `reeva-web-service` con ALB `reeva-node-alb` y target group `reeva-web-tg`.

### Operación
- Haz cambios en el repo → push a `main`.
- CodePipeline correrá Source → Build → Deploy.
- Revisa logs:
  - CodeBuild: `/aws/codebuild/reeva-node-build`.
  - Lambda: `/aws/lambda/reeva-pipeline-deploy`.
  - Tareas ECS: `/ecs/reeva-node-task`.
- Si el deploy falla, mira la ejecución en CodePipeline y los logs anteriores para identificar la etapa.

Con esta configuración, todo commit produce una nueva imagen en ECR y actualiza el servicio Fargate automáticamente.
