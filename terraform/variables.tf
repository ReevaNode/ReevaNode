# variables.tf
# configuracion general del proyecto

variable "aws_region" {
  description = "region de aws donde desplegar"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "nombre del proyecto"
  type        = string
  default     = "reeva"
}

variable "environment" {
  description = "ambiente (dev, staging, prod)"
  type        = string
  default     = "dev"
}

# fargate config
variable "fargate_cpu" {
  description = "cpu para fargate (256 = 0.25 vCPU)"
  type        = number
  default     = 256
}

variable "fargate_memory" {
  description = "memoria para fargate en MB"
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "numero de tareas corriendo"
  type        = number
  default     = 1
}

variable "use_fargate_spot" {
  description = "usar fargate spot (70% descuento)"
  type        = bool
  default     = true
}

# networking
variable "vpc_cidr" {
  description = "cidr para vpc"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "zonas de disponibilidad"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# app config
variable "container_port" {
  description = "puerto del container"
  type        = number
  default     = 3001
}

variable "health_check_path" {
  description = "ruta del health check"
  type        = string
  default     = "/health"
}

# secrets (usar aws secrets manager o variables de entorno)
variable "twilio_account_sid" {
  description = "twilio account sid"
  type        = string
  sensitive   = true
}

variable "twilio_auth_token" {
  description = "twilio auth token"
  type        = string
  sensitive   = true
}

variable "twilio_whatsapp_from" {
  description = "numero de whatsapp de twilio"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "openai api key"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "jwt secret para auth"
  type        = string
  sensitive   = true
}

# dominio (opcional)
variable "domain_name" {
  description = "dominio personalizado (ej: reeva.com)"
  type        = string
  default     = ""
}

variable "create_domain" {
  description = "crear dominio en route53"
  type        = bool
  default     = false
}
