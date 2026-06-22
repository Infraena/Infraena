{{/*
Expand the name of the chart.
*/}}
{{- define "idp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "idp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "idp.labels" -}}
helm.sh/chart: {{ include "idp.name" . }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "idp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: infraena
{{- end }}

{{/*
Selector labels
*/}}
{{- define "idp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "idp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
ServiceAccount name
*/}}
{{- define "idp.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "idp.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
API image
*/}}
{{- define "idp.api.image" -}}
{{ .Values.image.repository }}/{{ .Values.api.image.repository }}:{{ .Values.api.image.tag | default .Values.image.tag }}
{{- end }}

{{/*
Web image
*/}}
{{- define "idp.web.image" -}}
{{ .Values.image.repository }}/{{ .Values.web.image.repository }}:{{ .Values.web.image.tag | default .Values.image.tag }}
{{- end }}
