import db from '../../db.js';
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

async function addEstadoBoxToAllBoxes() {
    console.log('Actualizando tabla box para agregar campo idEstadoBox...\n');
    
    // Escanear todos los boxes
    const boxScan = await db.send(new ScanCommand({
        TableName: 'box'
    }));
    
    const boxes = boxScan.Items || [];
    console.log(`Total de boxes encontrados: ${boxes.length}`);
    
    let updated = 0;
    let errors = 0;
    
    for (const box of boxes) {
        try {
            await db.send(new UpdateCommand({
                TableName: 'box',
                Key: { idBox: box.idBox },
                UpdateExpression: 'SET idEstadoBox = :estado',
                ExpressionAttributeValues: {
                    ':estado': '3' // 3 = Inhabilitado
                }
            }));
            
            updated++;
            if (updated % 10 === 0) {
                console.log(`   Actualizados: ${updated}/${boxes.length}`);
            }
        } catch (error) {
            console.error(`   Error actualizando box ${box.idBox}:`, error.message);
            errors++;
        }
    }
    
    console.log('\n=== RESUMEN ===');
    console.log(`Boxes actualizados: ${updated}`);
    console.log(`Errores: ${errors}`);
    console.log(`Total: ${boxes.length}`);
    console.log('\nTodos los boxes ahora tienen idEstadoBox = "1" (Habilitado)');
}

addEstadoBoxToAllBoxes().catch(console.error);
