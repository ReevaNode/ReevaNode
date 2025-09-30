import mysql from "mysql2/promise";

// Crear el pool de conexiones
const db = mysql.createPool({
  host: "localhost",      // cambiar por tu host

  user: "reeva_user",          // cambiar por tu usuario
  password: "reeva123",     // cambiar por tu contraseña
  database: "reeva_db", // cambiar por el nombre de tu base de datos

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Probar conexión
(async () => {
  try {
    const connection = await db.getConnection();
    console.log("Conexión exitosa a MySQL");
    connection.release();
  } catch (err) {
    console.error("Error al conectar con MySQL:", err);
  }
})();

export default db;