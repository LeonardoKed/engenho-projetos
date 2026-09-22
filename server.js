import "dotenv/config";
import express from "express";
import multer from "multer";
import { BlobServiceClient } from "@azure/storage-blob";
import { TableClient } from "@azure/data-tables";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const port = process.env.PORT || 3000;
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

app.use(express.json());
app.use(express.static("public"));

const tables = {
  products: "Produtos",
  clients: "Clientes",
  orders: "Pedidos"
};

function ensureConfigured(res) {
  if (!connectionString) {
    res.status(503).json({ error: "Configure AZURE_STORAGE_CONNECTION_STRING no arquivo .env." });
    return false;
  }
  return true;
}

function client(name) {
  return TableClient.fromConnectionString(connectionString, name);
}

async function ensureTable(name) {
  const table = client(name);
  await table.createTable().catch(error => {
    if (error.statusCode !== 409) throw error;
  });
  return table;
}

function id() { return crypto.randomUUID(); }
function parse(entity) {
  const { partitionKey, rowKey, etag, timestamp, ...data } = entity;
  return { id: rowKey, ...data };
}
function number(value, field) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${field} inválido.`);
  return result;
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function editDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, index) => [index]);
  for (let column = 0; column <= b.length; column++) matrix[0][column] = column;
  for (let row = 1; row <= a.length; row++) for (let column = 1; column <= b.length; column++) matrix[row][column] = Math.min(matrix[row - 1][column] + 1, matrix[row][column - 1] + 1, matrix[row - 1][column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1));
  return matrix[a.length][b.length];
}

function matchesSearch(value, search) {
  const text = normalizeSearch(value);
  const query = normalizeSearch(search);
  if (!query || text.includes(query)) return true;
  const words = text.split(" ");
  return query.split(" ").every(term => words.some(word => word.includes(term) || term.includes(word) || editDistance(word, term) <= (term.length >= 6 ? 2 : 1)));
}

async function list(tableName) {
  const table = await ensureTable(tableName);
  const values = [];
  for await (const entity of table.listEntities()) values.push(parse(entity));
  return values;
}

async function get(tableName, rowKey) {
  const table = await ensureTable(tableName);
  return parse(await table.getEntity("app", rowKey));
}

async function uploadProductImage(file) {
  if (!file) return "";
  const blobService = BlobServiceClient.fromConnectionString(connectionString);
  const container = blobService.getContainerClient("product-images");
  await container.createIfNotExists({ access: "blob" });
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-");
  const blob = container.getBlockBlobClient(`${Date.now()}-${safeName}`);
  await blob.uploadData(file.buffer, { blobHTTPHeaders: { blobContentType: file.mimetype } });
  return blob.url;
}

app.get("/api/health", async (_req, res) => {
  if (!ensureConfigured(res)) return;
  try {
    await Promise.all(Object.values(tables).map(ensureTable));
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get("/api/products", async (req, res) => {
  if (!ensureConfigured(res)) return;
  try {
    let products = await list(tables.products);
    const brand = req.query.brand || "";
    const model = req.query.model || "";
    const maxPriceText = String(req.query.maxPrice || "").trim();
    const maxPrice = maxPriceText ? Number(maxPriceText) : Infinity;
    products = products.filter(p => matchesSearch(p.brand, brand) && matchesSearch(p.model, model) && Number(p.price) <= maxPrice);
    res.json(products.sort((a, b) => a.brand.localeCompare(b.brand)));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post("/api/products", upload.single("image"), async (req, res) => {
  if (!ensureConfigured(res)) return;
  try {
    const { brand, model } = req.body;
    if (!brand?.trim() || !model?.trim()) throw new Error("Marca e modelo são obrigatórios.");
    const product = { partitionKey: "app", rowKey: id(), brand: brand.trim(), model: model.trim(), price: number(req.body.price, "Valor"), quantity: number(req.body.quantity, "Quantidade"), imageUrl: await uploadProductImage(req.file) };
    const table = await ensureTable(tables.products);
    await table.createEntity(product);
    res.status(201).json(parse(product));
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.put("/api/products/:id", upload.single("image"), async (req, res) => {
  if (!ensureConfigured(res)) return;
  try {
    const existing = await get(tables.products, req.params.id);
    const product = { partitionKey: "app", rowKey: req.params.id, brand: req.body.brand?.trim() || existing.brand, model: req.body.model?.trim() || existing.model, price: req.body.price === undefined ? existing.price : number(req.body.price, "Valor"), quantity: req.body.quantity === undefined ? existing.quantity : number(req.body.quantity, "Quantidade"), imageUrl: req.file ? await uploadProductImage(req.file) : existing.imageUrl || "" };
    const table = await ensureTable(tables.products);
    await table.updateEntity(product, "Replace");
    res.json(parse(product));
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.delete("/api/products/:id", async (req, res) => {
  if (!ensureConfigured(res)) return;
  try { await (await ensureTable(tables.products)).deleteEntity("app", req.params.id); res.status(204).end(); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

app.get("/api/clients", async (_req, res) => {
  if (!ensureConfigured(res)) return;
  try { res.json(await list(tables.clients)); } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post("/api/clients", async (req, res) => {
  if (!ensureConfigured(res)) return;
  try {
    const { name, email, phone, address } = req.body;
    if (!name?.trim() || !email?.trim() || !phone?.trim()) throw new Error("Nome, e-mail e telefone são obrigatórios.");
    const entity = { partitionKey: "app", rowKey: id(), name: name.trim(), email: email.trim(), phone: phone.trim(), address: address?.trim() || "" };
    await (await ensureTable(tables.clients)).createEntity(entity);
    res.status(201).json(parse(entity));
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.put("/api/clients/:id", async (req, res) => {
  if (!ensureConfigured(res)) return;
  try {
    const old = await get(tables.clients, req.params.id);
    const entity = { partitionKey: "app", rowKey: req.params.id, name: req.body.name?.trim() || old.name, email: req.body.email?.trim() || old.email, phone: req.body.phone?.trim() || old.phone, address: req.body.address?.trim() ?? old.address };
    await (await ensureTable(tables.clients)).updateEntity(entity, "Replace");
    res.json(parse(entity));
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.delete("/api/clients/:id", async (req, res) => {
  if (!ensureConfigured(res)) return;
  try { await (await ensureTable(tables.clients)).deleteEntity("app", req.params.id); res.status(204).end(); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

app.get("/api/orders", async (req, res) => {
  if (!ensureConfigured(res)) return;
  try {
    const orders = await list(tables.orders);
    res.json(req.query.clientId ? orders.filter(o => o.clientId === req.query.clientId) : orders);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post("/api/orders", async (req, res) => {
  if (!ensureConfigured(res)) return;
  try {
    const { clientId, items, paymentMethod, deliveryMethod } = req.body;
    if (!clientId || !Array.isArray(items) || !items.length || !paymentMethod || !deliveryMethod) throw new Error("Preencha cliente, itens, pagamento e entrega.");
    await get(tables.clients, clientId);
    const productsTable = await ensureTable(tables.products);
    let total = 0;
    const checkedItems = [];
    for (const item of items) {
      const product = await get(tables.products, item.productId);
      const quantity = number(item.quantity, "Quantidade");
      if (!Number.isInteger(quantity) || quantity === 0) throw new Error("Quantidade deve ser um número inteiro maior que zero.");
      if (Number(product.quantity) < quantity) throw new Error(`Estoque insuficiente para ${product.brand} ${product.model}.`);
      total += Number(product.price) * quantity;
      checkedItems.push({ product, quantity });
    }
    for (const { product, quantity } of checkedItems) await productsTable.updateEntity({ partitionKey: "app", rowKey: product.id, brand: product.brand, model: product.model, price: product.price, quantity: Number(product.quantity) - quantity, imageUrl: product.imageUrl || "" }, "Replace");
    const order = { partitionKey: "app", rowKey: id(), clientId, items: JSON.stringify(checkedItems.map(({ product, quantity }) => ({ productId: product.id, description: `${product.brand} ${product.model}`, quantity, unitPrice: product.price }))), total, paymentMethod, deliveryMethod, status: "Confirmado", createdAt: new Date().toISOString() };
    await (await ensureTable(tables.orders)).createEntity(order);
    res.status(201).json(parse(order));
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.listen(port, () => console.log(`Aplicação disponível em http://localhost:${port}`));
