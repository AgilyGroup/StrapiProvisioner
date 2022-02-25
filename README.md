# Agily Strapi provisioner

![Provisioner logo](https://github.com/AgilyGroup/StrapiProvisioner/blob/main/logo.png?raw=true)

## Description

This project aims to fill the database of a Strapi project according to data samples specified into the project repository.

As the data is specified into the target project repository, it can allow people to specify different data samples for every branch, thus allowing to provide datasets for the new feature in development.

## How does it work ?

This script is meant to be executed via a npm script (or npx) directly from within the target project.

It then looks for a `provisioner` folder, directly located in the root folder of the project.

This folder contains subfolders for each api endpoints to use. Each of this subfolders can contains `.json` or `.js` files, containing data.

Data contained in files can be JSON objects (dictionnaries) or array of JSON objects. In case of an array of objects, each object will be processed separately.

For each record found in this files, it will try to create them or update them (if they are already found, see the "upserting records" section of this readme) using Strapi API.

Every other record found in the database will remain as-is.

## Usage 

You can execute this script directly from any Strapi project without any specific installation with the following command :

```npx https://github.com/AgilyGroup/StrapiProvisioner```

```
usage: index.js [-h] [-v] [-e EMAIL] [-p PASSWORD]

Argparse example

optional arguments:
  -h, --help            show this help message and exit
  -v, --version         show program's version number and exit
  -e EMAIL, --email EMAIL
  -p PASSWORD, --password PASSWORD

```

If no email and/or password is provided from the command line, the provisioner will :
- try to find `PROVISIONNING_EMAIL` and `PROVISIONNING_PASSWORD` environment variables directly from the env file of the project
- ask for them via command prompts

## Folder hierarchy example

```
/
  provisioner/
    user-private-messages/
      message1.json
      message2.json
    restaurants/
      restaurant-paris.json
      restaurant-london.json
      restaurants-italy.json
```

## Upserting records

Sometimes, it is necessary to ensure that a record is not present before inserting it, and if the record is found, to just update it. This is usually called an "upsert" ("update or insert").

To acheive this, you can add to every record you want to upsert an additionnal `__upsertFilter` key :
```
{
  "__upsertFilter": {
    "message": "new from provisionner unique 1"
  },
  "message": "new from provisionner unique 1",
  "date": new Date(),
  "to": {
    "id": 2
  },
  "user": {
    "id": 1
  }
}
```

If found, the provisioner will try to query records with the `__upsertFilter` filter. If at least one record is found, it will update the first record found.

## Scripting inserts

As specified above, you can add `.json` and `.js` files into the provisionning folders. Although `.json` files are usually adequate enough for static data, sometimes it is needed to calculate values to store in the records (such as generating random values, or dates relative to the date of the provisioning).

If you want to do so, you can create a `.js` file, that will be imported from the provisioner : 

```
module.exports = {
  message: "new from provisionner",
  date: new Date(),
  randomValue: Math.random()
};
```

You can of course use the `require` directive from this file to use libraries (such as `faker`) for instance, and use environment variables present in your project.

## Customizing endpoints

You can also specify on each record how the API is called via the `__findEndpoint` `__createEndpoint` `__updateEndpoint` properties :

```
{
  "__findEndpoint": "user-permissions/roles",
  "__createEndpoint": "user-permissions/roles",
  "__updateEndpoint": "user-permissions/roles",
  "message": "new from provisionner",
}
```

## In case the records are contained in a specific key of the payload when finding records

You can also specify the key containing the records with `__findPayloadKey` :

For instance, if using the `users-permissions/roles` endpoint to create user roles, the api will return  `{ roles: [{ ... }]}` when looking for roles. You can overcome this problem like written below :

```
{
  "__findEndpoint": "users-permissions/roles",
  "__findPayloadKey": "roles",
  "__createEndpoint": "users-permissions/roles",
  "__updateEndpoint": "users-permissions/roles",
  "message": "new from provisionner",
}
```

## Relation between records

In any record, you can use the following syntax to create relations between records :

```
{
  "lesson": {
    "__find": {
      "endpoint": "lessons",
      "filter": { "name": "first lesson" }
    }
  },
}
```

In every part of the record, you can add a JSON object with a `__find` or `__findAll` key. The value assigned to this key is an object as well, with an `endpoint` and a `filter` category.

The object containing the `__find` keyword will then be replaced by the object representing the first record found.

If the keyword used is `__findAll`, the replaced value will be an array containing all the found results.