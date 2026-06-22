{{- define "service-chart.fullname" -}}
{{ .Release.Name }}
{{- end }}

{{- define "service-chart.labels" -}}
app.kubernetes.io/name: {{ .Release.Name }}
app.kubernetes.io/managed-by: idp
idp.platform/service: {{ .Release.Name }}
{{- end }}

{{- define "service-chart.selectorLabels" -}}
app.kubernetes.io/name: {{ .Release.Name }}
{{- end }}

{{- define "service-chart.serviceAccountName" -}}
{{ .Release.Name }}
{{- end }}
