<?php
// Copy this file to config.php and fill in the MySQL details from the 20i control panel
// (Hosting > Manage > MySQL Databases). The tables are created automatically on first visit.
return [
    'driver'  => 'mysql',
    'db_host' => 'localhost',          // 20i shows the host next to the database, e.g. something like sdb-xx.hosting.stackcp.net
    'db_name' => 'your_database_name',
    'db_user' => 'your_database_user',
    'db_pass' => 'your_database_password',
];
