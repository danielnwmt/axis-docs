variable "project" {
  type    = string
  default = "axisdocs"
}

variable "aws_region" {
  type    = string
  default = "sa-east-1"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "allowed_origins" {
  description = "Origens do frontend autorizadas no CORS do bucket"
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  type    = number
  default = 90
}

variable "noncurrent_version_retention_days" {
  type    = number
  default = 90
}

variable "api_secret_arns" {
  description = "ARNs dos segredos do Secrets Manager usados pela task da API"
  type        = list(string)
  default     = []
}
