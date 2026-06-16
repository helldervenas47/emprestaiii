---
name: Default public signup role
description: Public signups must automatically get only the Cliente role
type: feature
---
Todo novo usuário criado por fluxo público de cadastro deve receber automaticamente o papel `cliente`.

Aplica-se a cadastro por formulário, Google, plano gratuito, plano pago e qualquer criação sem intervenção administrativa.

Papéis `admin`, `gerente` e `visualizador` nunca devem ser atribuídos automaticamente em cadastro público; somente administradores podem alterar depois.