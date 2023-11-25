require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const Shopify = require('shopify-api-node');

const shopify = new Shopify({
    shopName: process.env.Y2K_SHOP_NAME,
    accessToken: process.env.Y2K_API_TOKEN
});

shopify.webhook.create({
    address: 'https://intimate-enjoyed-tomcat.ngrok-free.app/webhook/shopify/ordersPaid',
    topic: 'orders/paid',
}).then((webhook) => console.log("Webhook creation : ", webhook)).catch((err) => console.error("Webhook creation error : ", err.response.body));

const app = express();

app.use(bodyParser.json());

const port = process.env.PORT || 3000;

app.post('/webhook/shopify/ordersPaid', (req, res) => {
    // (Attention je peux recevoir plusieurs variantes de différents produits)
    // Je reçois un variant de produit
    // Je récupère tag du produit provenant du variant
    // Je fais une recherche de tous les produits ayant comme tag, le tag du produit provenant du variant
    // Je mets à jour la quantité de tous les produits trouvés à 0

    const products = req.body.line_items
    const idLocation = 78155153684

    console.log("Variant du produit", products)

    products.map(async (product) => {
        const mainProduct = await shopify.product.get(product.product_id).then((product) => product).catch((err) => console.error("Get product by id error : ", err.response.body));
        const tag = mainProduct.tags.match(/#[0-9]{4}/)[0]
        console.log("Tag du produit principal :", tag)

        fetch(process.env.Y2K_URL_STOREFRONT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Storefront-Access-Token': process.env.Y2K_STOREFRONT_TOKEN,
            },
            body: JSON.stringify({
                query: `query searchWithFilters($query: String!, $first: Int, $productFilters: [ProductFilter!]) {
                  search(query: $query, first: $first, productFilters: $productFilters) {
                    edges {
                      node {
                        ... on Product {
                          title
                          id
                        }
                      }
                    }
                  }
                }`,
                variables: {
                    query: "",
                    first: 100,
                    productFilters: [
                        {tag}
                    ]
                }
            })
        }).then((response) => response.json())
            .then((products) => {
                console.log('Tous les produits principaux ayant le tag :', products.data.search.edges.map(el => el));
                products.data.search.edges.map(el => {
                    const idProduct = el.node.id.match(/\d+$/)[0]
                    shopify.product.get(idProduct).then((productVariant) => {
                        productVariant.variants.map((variant) => {
                            shopify.inventoryLevel.set({
                                "location_id": idLocation,
                                "inventory_item_id": variant.inventory_item_id,
                                "available": 0
                            }).then((inventoryLevel) => console.log("Inventaire de la variante du produit MAJ :", inventoryLevel)).catch((err) => console.error("Inventory level error :", err.response.body));
                        })
                    }).catch((err) => console.error("Get product variant by id error : ", err.response.body));
                })
            })
            .catch((error) => {
                console.error('GraphQL error :', error);
            });
    })

    res.status(200).send('Webhook received successfully');
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});