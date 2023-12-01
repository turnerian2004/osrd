use std::{
    collections::{HashMap, HashSet},
    ops::{Deref, DerefMut},
};

use darling::{
    ast,
    util::{self, PathList},
    FromDeriveInput, FromField, FromMeta, Result,
};
use proc_macro2::{Ident, Span, TokenStream};
use quote::quote;
use syn::DeriveInput;

#[derive(Debug, Clone, PartialEq, Hash, Eq)]
enum Identifier {
    Field(syn::Ident),
    Compound(Vec<syn::Ident>),
}

impl Identifier {
    fn get_field<'a>(&self, config: &'a ModelConfig) -> Option<&'a ModelField> {
        match self {
            Self::Field(ident) => config.fields.get(ident),
            Self::Compound(_) => None,
        }
    }

    fn get_idents(&self) -> Vec<syn::Ident> {
        match self {
            Self::Field(ident) => vec![ident.clone()],
            Self::Compound(idents) => idents.clone(),
        }
    }

    fn get_ident_lvalue(&self) -> TokenStream {
        match self {
            Self::Field(ident) => quote! { #ident },
            Self::Compound(idents) => {
                quote! { (#(#idents),*) }
            }
        }
    }

    fn type_expr(&self, config: &ModelConfig) -> TokenStream {
        match self {
            Self::Field(_) => {
                let ty = &self.get_field(config).unwrap().ty;
                quote! { #ty }
            }
            Self::Compound(idents) => {
                let ty = idents
                    .iter()
                    .map(|ident| &config.fields.get(ident).unwrap().ty);
                quote! { (#(#ty),*) }
            }
        }
    }
}

fn extract_ident_of_path(path: &syn::Path) -> Result<syn::Ident> {
    let mut segments = path.segments.iter();
    let first = segments.next().unwrap();
    if segments.next().is_some() {
        Err(darling::Error::custom(
            "Model: unexpected path in 'identifier' expression",
        ))
    } else {
        Ok(first.ident.clone())
    }
}

impl darling::FromMeta for Identifier {
    fn from_expr(expr: &syn::Expr) -> Result<Self> {
        match expr {
            syn::Expr::Path(path) => Ok(Identifier::Field(extract_ident_of_path(&path.path)?)),
            syn::Expr::Tuple(tuple) => {
                let mut idents = Vec::new();
                for expr in tuple.elems.iter() {
                    match expr {
                        syn::Expr::Path(path) => {
                            idents.push(extract_ident_of_path(&path.path)?);
                        }
                        _ => return Err(darling::Error::custom(
                            "Model: invalid compound 'identifier' expression: must be a tuple of idents",
                        )),
                    }
                }
                Ok(Identifier::Compound(idents))
            }
            _ => Err(darling::Error::custom(
                "Model: invalid 'identifier' expression",
            )),
        }
    }
}

#[derive(FromDeriveInput, Debug)]
#[darling(
    attributes(model),
    forward_attrs(allow, doc, cfg),
    supports(struct_named)
)]
struct ModelOptions {
    table: syn::Path,
    #[darling(default)]
    row: GeneratedType,
    #[darling(default)]
    changeset: GeneratedType,
    #[darling(multiple, rename = "identifier")]
    identifiers: Vec<Identifier>,
    #[darling(default)]
    preferred: Option<Identifier>,
    data: ast::Data<util::Ignored, ModelFieldOption>,
}

#[derive(FromMeta, Default, Debug, PartialEq)]
struct GeneratedType {
    #[darling(default)]
    type_name: Option<String>,
    #[darling(default)]
    derive: PathList,
    #[darling(default)]
    public: bool,
}

#[derive(FromField, Debug)]
#[darling(attributes(model), forward_attrs(allow, doc, cfg))]
struct ModelFieldOption {
    ident: Option<syn::Ident>,
    ty: syn::Type,
    #[darling(default)]
    builder_fn: Option<syn::Ident>,
    #[darling(default)]
    column: Option<String>,
    #[darling(default)]
    builder_skip: bool,
    #[darling(default)]
    identifier: bool,
    #[darling(default)]
    preferred: bool,
    #[darling(default)]
    primary: bool,
    #[darling(default)]
    json: bool,
    #[darling(default)]
    geo: bool,
}

#[derive(Debug, PartialEq)]
struct ModelConfig {
    model: syn::Ident,
    table: syn::Path,
    fields: Fields,
    row: GeneratedType,
    changeset: GeneratedType,
    identifiers: HashSet<Identifier>, // identifiers ⊆ fields
    preferred_identifier: Identifier, // preferred_identifier ∈ identifiers
    primary_field: Identifier,        // primary_field ∈ identifiers
}

#[derive(Debug, PartialEq, Clone)]
struct ModelField {
    ident: syn::Ident,
    column: String,
    builder_ident: syn::Ident,
    ty: syn::Type,
    builder_skip: bool,
    identifier: bool,
    preferred: bool,
    primary: bool,
    json: bool,
    geo: bool,
}

impl From<ModelFieldOption> for ModelField {
    fn from(value: ModelFieldOption) -> Self {
        let ident = value.ident.expect("Model only works for named structs");
        let column = value.column.unwrap_or_else(|| ident.to_string());
        let builder_ident = value.builder_fn.unwrap_or_else(|| ident.clone());
        Self {
            ident,
            builder_ident,
            column,
            ty: value.ty,
            builder_skip: value.builder_skip,
            identifier: value.identifier,
            preferred: value.preferred,
            primary: value.primary,
            json: value.json,
            geo: value.geo,
        }
    }
}

#[derive(Debug, PartialEq)]
struct Fields(Vec<ModelField>);

impl Deref for Fields {
    type Target = Vec<ModelField>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for Fields {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl Fields {
    fn get(&self, ident: &syn::Ident) -> Option<&ModelField> {
        self.iter().find(|field| &field.ident == ident)
    }
}

impl ModelConfig {
    fn new(options: ModelOptions, model_name: syn::Ident) -> Self {
        let row = GeneratedType {
            type_name: options.row.type_name.or(Some(format!("{}Row", model_name))),
            ..options.row
        };
        let changeset = GeneratedType {
            type_name: options
                .changeset
                .type_name
                .or(Some(format!("{}Changeset", model_name))),
            ..options.changeset
        };

        // transform fields
        let fields = Fields(
            options
                .data
                .take_struct()
                .expect("Model: only named structs are supported")
                .fields
                .into_iter()
                .map(Into::into)
                .collect(),
        );
        let first_field = &fields
            .first()
            .expect("Model: at least one field is required")
            .ident;
        let field_map: HashMap<_, _> = fields
            .iter()
            .map(|field| (field.ident.clone(), field.clone()))
            .collect();

        // collect identifiers from struct-level annotations...
        let mut identifiers: HashSet<_> = options
            .identifiers
            .iter()
            .cloned()
            .chain(
                // ... and those at the field-level
                field_map
                    .values()
                    .filter(|field| field.identifier)
                    .map(|field| Identifier::Field(field.ident.clone())),
            )
            .collect();

        // collect of infer the primary key field
        let primary_field = match field_map
            .values()
            .filter(|field| field.primary)
            .collect::<Vec<_>>()
            .as_slice()
        {
            [pf] => Identifier::Field(pf.ident.clone()),
            [] => {
                let id = Ident::new("id", Span::call_site());
                Identifier::Field(
                    field_map
                        .get(&id)
                        .map(|f| f.ident.clone())
                        .unwrap_or_else(|| first_field.clone()),
                )
            }
            _ => panic!("Model: multiple primary fields found"),
        };

        // collect or infer the preferred identifier field
        let preferred_identifier = match (
            options.preferred.as_ref(),
            field_map
                .values()
                .filter(|field| field.primary)
                .collect::<Vec<_>>()
                .as_slice(),
        ) {
            (Some(id), []) => id.clone(),
            (None, [field]) => Identifier::Field(field.ident.clone()),
            (None, []) => primary_field.clone(),
            _ => panic!("Model: conflicting preferred field declarations"),
        };

        identifiers.insert(primary_field.clone());
        identifiers.insert(preferred_identifier.clone());

        Self {
            model: model_name,
            table: options.table,
            fields,
            identifiers,
            preferred_identifier,
            primary_field,
            row,
            changeset,
        }
    }

    fn iter_fields(&self) -> impl Iterator<Item = &ModelField> {
        self.fields.iter()
    }

    fn is_primary(&self, field: &ModelField) -> bool {
        match &self.primary_field {
            Identifier::Field(ident) => ident == &field.ident,
            Identifier::Compound(_) => false,
        }
    }

    fn table_name(&self) -> syn::Ident {
        let table = self
            .table
            .segments
            .last()
            .expect("Model: invalid table value");
        table.ident.clone()
    }

    fn make_model_decl(&self, vis: &syn::Visibility) -> TokenStream {
        let model = &self.model;
        let table = &self.table;
        let (field, (ty, column)): (Vec<_>, (Vec<_>, Vec<_>)) = self
            .iter_fields()
            .map(|field| (&field.ident, (&field.ty, &field.column)))
            .unzip();
        let (cs_field, (cs_ty, cs_column)): (Vec<_>, (Vec<_>, Vec<_>)) = self
            .iter_fields()
            .filter(|f| !self.is_primary(f))
            .map(|field| (&field.ident, (&field.ty, &field.column)))
            .unzip();
        let cs_ident = self.changeset.ident();
        let cs_derive = &self.changeset.derive;
        let cs_pub = if self.changeset.public {
            quote! { pub }
        } else {
            quote! {}
        };
        let row_ident = self.row.ident();
        let row_derive = &self.row.derive;
        let row_pub = if self.row.public {
            quote! { pub }
        } else {
            quote! {}
        };
        quote! {
            #[automatically_derived]
            impl crate::modelsv2::Model for #model {
                type Row = #row_ident;
                type Changeset = #cs_ident;
            }

            #[derive(Queryable, QueryableByName, #(#row_derive),*)]
            #[diesel(table_name = #table)]
            #vis struct #row_ident {
                #(#[diesel(column_name = #column)] #row_pub #field: #ty),*
            }

            #[derive(Default, Queryable, AsChangeset, Insertable, #(#cs_derive),*)]
            #[diesel(table_name = #table)]
            #vis struct #cs_ident {
                #(#[diesel(deserialize_as = #cs_ty, column_name = #cs_column)] #cs_pub #cs_field: Option<#cs_ty>),*
            }
        }
    }

    fn make_builder(&self, changeset: bool) -> TokenStream {
        let (fields, (fns, (types, bodies))): (Vec<_>, (Vec<_>, (Vec<_>, Vec<_>))) = self
            .iter_fields()
            .filter(|f| !self.is_primary(f))
            .filter(|field| !field.builder_skip)
            .map(|field| {
                let ident = &field.ident;
                let body = if changeset {
                    quote! { self.#ident = Some(#ident) }
                } else {
                    quote! { self.changeset.#ident = Some(#ident) }
                };
                (ident, (&field.builder_ident, (&field.ty, body)))
            })
            .unzip();

        let impl_decl = if changeset {
            let tn = self.changeset.ident();
            quote! { impl #tn }
        } else {
            let tn = &self.model;
            quote! { impl<'a> crate::modelsv2::Patch<'a, #tn> }
        };

        quote! {
            #[automatically_derived]
            #impl_decl {
                #(
                    #[allow(unused)]
                    #[must_use = "builder methods are intended to be chained"]
                    pub fn #fns(mut self, #fields: #types) -> Self {
                        #bodies;
                        self
                    }
                )*
            }
        }
    }

    fn make_identifiers_impls(&self) -> TokenStream {
        let model = &self.model;
        let (idents, ty): (Vec<_>, Vec<_>) = self
            .identifiers
            .iter()
            .map(|id| (id.get_idents(), id.type_expr(self)))
            .unzip();
        let prefer_ty = self.preferred_identifier.type_expr(self);
        quote! {
            #(#[automatically_derived] impl crate::models::Identifiable<#ty> for #model {
                fn get_id(&self) -> #ty {
                    (#(self.#idents.clone()),*)
                }
            })*
            #[automatically_derived]
            impl crate::models::PreferredId<#prefer_ty> for #model {}
        }
    }

    fn make_from_impls(&self) -> TokenStream {
        let model = &self.model;
        let field: Vec<_> = self.iter_fields().map(|field| &field.ident).collect();
        let cs_field: Vec<_> = self
            .iter_fields()
            .filter(|f| !self.is_primary(f))
            .map(|field| &field.ident)
            .collect();
        let row_ident = self.row.ident();
        let cs_ident = self.changeset.ident();
        quote! {
            #[automatically_derived]
            impl From<#row_ident> for #model {
                fn from(row: #row_ident) -> Self {
                    Self {
                        #( #field: row.#field ),*
                    }
                }
            }

            #[automatically_derived]
            impl From<#model> for #cs_ident {
                fn from(model: #model) -> Self {
                    Self {
                        #( #cs_field: Some(model.#cs_field) ),*
                    }
                }
            }
        }
    }

    fn make_model_traits_impl(&self) -> TokenStream {
        let model = &self.model;
        let table_mod = &self.table;
        let table_name = self.table_name();
        let row_ident = self.row.ident();
        let cs_ident = self.changeset.ident();
        let (ty, (ident, filter)): (Vec<_>, (Vec<_>, Vec<_>)) = self
            .identifiers
            .iter()
            .map(|id| {
                let (ident, column): (Vec<_>, Vec<_>) = id
                    .get_idents()
                    .into_iter()
                    .map(|ident| {
                        let field = self.fields.get(&ident).unwrap();
                        let column = Ident::new(&field.column, Span::call_site());
                        (ident, column)
                    })
                    .unzip();
                let filters = quote! { #(filter(dsl::#column.eq(#ident))).* };
                (id.type_expr(self), (id.get_ident_lvalue(), filters))
            })
            .unzip();
        let Identifier::Field(pk) = &self.primary_field else {
            panic!("Model: primary field must be a single field - should not happen");
        };
        quote! {
            #(
                #[automatically_derived]
                #[async_trait::async_trait]
                impl crate::modelsv2::Retrieve<#ty> for #model {
                    async fn retrieve(
                        conn: &mut diesel_async::AsyncPgConnection,
                        #ident: #ty,
                    ) -> crate::error::Result<Option<#model>> {
                        use diesel::prelude::*;
                        use diesel_async::RunQueryDsl;
                        use #table_mod::dsl;
                        dsl::#table_name
                            .#filter
                            .first::<#row_ident>(conn)
                            .await
                            .map(Into::into)
                            .optional()
                            .map_err(Into::into)
                    }
                }

                #[automatically_derived]
                #[async_trait::async_trait]
                impl crate::modelsv2::Update<#ty, #model> for #cs_ident {
                    async fn update(
                        self,
                        conn: &mut diesel_async::AsyncPgConnection,
                        #ident: #ty,
                    ) -> crate::error::Result<Option<#model>> {
                        use diesel::prelude::*;
                        use diesel_async::RunQueryDsl;
                        use #table_mod::dsl;
                        diesel::update(dsl::#table_name.#filter)
                            .set(&self)
                            .get_result::<#row_ident>(conn)
                            .await
                            .map(Into::into)
                            .optional()
                            .map_err(Into::into)
                    }
                }

                #[automatically_derived]
                #[async_trait::async_trait]
                impl crate::modelsv2::DeleteStatic<#ty> for #model {
                    async fn delete_static(
                        conn: &mut diesel_async::AsyncPgConnection,
                        #ident: #ty,
                    ) -> crate::error::Result<bool> {
                        use diesel::prelude::*;
                        use diesel_async::RunQueryDsl;
                        use #table_mod::dsl;
                        diesel::delete(dsl::#table_name.#filter)
                            .execute(conn)
                            .await
                            .map(|n| n == 1)
                            .map_err(Into::into)
                    }
                }
            )*

            #[automatically_derived]
            #[async_trait::async_trait]
            impl crate::modelsv2::Create<#model> for #cs_ident {
                async fn create(
                    self,
                    conn: &mut diesel_async::AsyncPgConnection,
                ) -> crate::error::Result<#model> {
                    use diesel_async::RunQueryDsl;
                    diesel::insert_into(#table_mod::table)
                        .values(&self)
                        .get_result::<#row_ident>(conn)
                        .await
                        .map(Into::into)
                        .map_err(Into::into)
                }
            }

            #[automatically_derived]
            #[async_trait::async_trait]
            impl crate::modelsv2::Delete for #model {
                async fn delete(
                    &self,
                    conn: &mut diesel_async::AsyncPgConnection,
                ) -> crate::error::Result<bool> {
                    use diesel::prelude::*;
                    use diesel_async::RunQueryDsl;
                    use #table_mod::dsl;
                    let id = self.#pk;
                    diesel::delete(#table_mod::table.find(id))
                        .execute(conn)
                        .await
                        .map(|n| n == 1)
                        .map_err(Into::into)
                }
            }
        }
    }
}

impl GeneratedType {
    fn ident(&self) -> Ident {
        Ident::new(self.type_name.as_ref().unwrap(), Span::call_site())
    }
}

pub fn model(input: &DeriveInput) -> Result<TokenStream> {
    let model_name = &input.ident;
    let model_vis = &input.vis;
    let options = ModelOptions::from_derive_input(input)?;
    let config = ModelConfig::new(options, model_name.clone());

    let identifiers_impls = config.make_identifiers_impls();
    let model_decl = config.make_model_decl(model_vis);
    let from_impls = config.make_from_impls();

    let cs_builder = config.make_builder(true);
    let patch_builder = config.make_builder(false);

    let model_impls = config.make_model_traits_impl();

    Ok(quote! {
        #identifiers_impls
        #model_decl
        #from_impls
        #cs_builder
        #patch_builder
        #model_impls
    })
}

#[cfg(test)]
#[test]
fn test_construction() {
    let input = syn::parse_quote! {
        #[derive(Clone, Model)]
        #[model(table = crate::tables::osrd_infra_document)]
        #[model(row(type_name = "DocumentRow", derive(Debug)))]
        #[model(changeset(type_name = "DocumentChangeset", public, derive(Debug)))] // fields are public
        struct Document {
            #[model(column = "id", preferred, primary)]
            id_: i64,
            #[model(identifier, json, geo)]
            content_type: String,
            data: Vec<u8>,
        }
    };
    let _ = model(&input).expect("should generate");
}