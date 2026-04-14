

## Plano: Exportar todas as tabelas para CSV

Vou gerar arquivos CSV para cada uma das 16 tabelas do banco de dados e disponibilizá-los para download.

### Tabelas a exportar
1. **clients** (20+ registros)
2. **loans** (20+ registros)
3. **payments** (20+ registros)
4. **sales** (10+ registros)
5. **expenses** (2 registros)
6. **products** (vazia)
7. **profiles** (3 registros)
8. **balance** (1 registro)
9. **vehicle_registry** (3 registros)
10. **vehicle_balance** (1 registro)
11. **locador_info** (1 registro)
12. **loan_installments** (30+ registros)
13. **user_roles** (3 registros)
14. **user_owner** (2 registros)
15. **user_tab_permissions** (2 registros)
16. **user_client_permissions** (1 registro)

### Implementação
- Executar um script Python que conecta ao banco via `psql` e exporta cada tabela com `COPY ... TO STDOUT WITH CSV HEADER`
- Salvar todos os CSVs em `/mnt/documents/export/`
- Tabelas vazias (products) serão exportadas apenas com headers

### Resultado
Você receberá 16 arquivos CSV prontos para download, um para cada tabela.

