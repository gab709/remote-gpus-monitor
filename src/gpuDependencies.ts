import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'ssh2';

class Dependency extends vscode.TreeItem {
	constructor(
	  public readonly server: string,
	  public readonly user: string,
	  public readonly key_file: string,
	  private state: string,
	  public readonly collapsibleState: vscode.TreeItemCollapsibleState
	) {
	  super(server, collapsibleState);
	  this.tooltip = `${this.server}`;
	  this.description = ``;
	  if(this.state=='serv'){
		this.description = `${this.user}`;
		this.iconPath = {light: path.join(__filename, '..', '..', 'resources', 'light', 'vm.svg'),
			dark: path.join(__filename, '..', '..', 'resources', 'dark', 'vm.svg')
	  	};
	  }
	  else if( this.state=='true'){
		this.iconPath = {
			light: path.join(__filename, '..', '..', 'resources', 'dark', 'red.svg'),
			dark: path.join(__filename, '..', '..', 'resources', 'dark', 'red.svg')
		  };
		}
		else if( this.state=='false'){
			this.iconPath = {

				light: path.join(__filename, '..', '..', 'resources', 'dark', 'green.svg'),
				dark: path.join(__filename, '..', '..', 'resources', 'dark', 'green.svg')
				};
		}
		else{
			this.iconPath = {

				light: path.join(__filename, '..', '..', 'resources', 'light', 'warning.svg'),
				dark: path.join(__filename, '..', '..', 'resources', 'dark', 'warning.svg')
				};
		}
	}

  }

interface GPU {
	name: string;
	isBusy: string;
	}

async function executePidQuery(conn: Client): Promise<string> {
	return new Promise((resolve, reject) => {
	conn.exec('nvidia-smi --query-compute-apps=gpu_bus_id --format=csv,noheader', (err, stream) => {
		if (err) reject(err);
		let result = '';
		stream.on('data', (data) => (result += data.toString()));
		stream.on('end', () => resolve(result));
		stream.stderr.on('data', (data) => reject(data.toString()));
	});
	});
}
async function executeGPUsQuery(conn: Client): Promise<string> {
	return new Promise((resolve, reject) => {
	conn.exec('nvidia-smi --query-gpu=gpu_bus_id --format=csv,noheader', (err, stream) => {
		if (err) reject(err);
		let result = '';
		stream.on('data', (data) => (result += data.toString()));
		stream.on('end', () => resolve(result));
		stream.stderr.on('data', (data) => reject(data.toString()));
	});
	});
}
async function nvidiaQuerytoDep(serverAddress: string, username: string, file_key: string): Promise<Dependency[]> {
	const dependeciesList: Dependency[] = [];
	const conn = new Client();
	try {
		await Promise.race([
		  new Promise<void>((resolve, reject) => {
			conn.on('ready', () => resolve());
			conn.on('error', reject);
	  
			conn.connect({
			  host: serverAddress,
			  username: username,
			  privateKey: fs.readFileSync(file_key, 'utf8'),
			});
		  }),
		  new Promise<void>((resolve, reject) => {
			setTimeout(() => reject(new Error('Connection timeout')), 3000); // 30 seconds timeout
		  }),
		]);
		const gpuInfo = await executeGPUsQuery(conn);
		const pidInfo = await executePidQuery(conn);
		const parsedGpuInfo = parseGpuInfo(gpuInfo,pidInfo);

		for (let i = 0; i < parsedGpuInfo.length; i++) {
			let busy='false'
			if(parsedGpuInfo[i].isBusy=='true'){
				busy='true'
			}
			dependeciesList.push(new Dependency(
				parsedGpuInfo[i].name,
				'',
				'',
				busy,
				vscode.TreeItemCollapsibleState.None
			))
		}
	  } catch (error) {
		console.log('An error occurred during SSH connection:', error);
		dependeciesList.push(new Dependency(
			'Server not available',
			'',
			'',
			'alert',
			vscode.TreeItemCollapsibleState.None
		))
	  }

	return dependeciesList
  }
/*
async function nvidiaQuerytoDep(serverAddress: string, username: string, file_key: string): Promise<Dependency[]> {
	const dependeciesList: Dependency[] = [];
	const conn = new Client();
    console.log(serverAddress)
    try {
	
      await new Promise<void>((resolve, reject) => {
        conn.on('ready', () => resolve());
        conn.on('error', reject);

        conn.connect({
            host: serverAddress,
            username: username,
            privateKey: fs.readFileSync(file_key, 'utf8'),
			readyTimeout: 800,
          });
         });

		const gpuInfo = await executeGPUsQuery(conn);
        const pidInfo = await executePidQuery(conn);
		const parsedGpuInfo = parseGpuInfo(gpuInfo,pidInfo);

		for (let i = 0; i < parsedGpuInfo.length; i++) {
			let busy='false'
			if(parsedGpuInfo[i].isBusy=='true'){
				busy='true'
			}
			dependeciesList.push(new Dependency(
				parsedGpuInfo[i].name,
				'',
				'',
				busy,
				vscode.TreeItemCollapsibleState.None
			))
		}

	} 
	catch (err) {
		console.log('Error')
		console.log(serverAddress)
		vscode.window.showErrorMessage(`Error connecting to the remote server: ${err}`);
	} finally {
		conn.end(); // Disconnect from the remote server
	}
	console.log(serverAddress,dependeciesList.length)
	if(dependeciesList.length==0){
		dependeciesList.push(new Dependency(
			'Server not available',
			'',
			'',
			'true',
			vscode.TreeItemCollapsibleState.None
		))
	}
	return dependeciesList
  }
*/

function parseGpuInfo(gpuInfo: string, pidInfo: string): GPU[] {
    const gpuList: GPU[] = [];
    const gpus = gpuInfo.split('\n');
    const pids = pidInfo.split('\n');

    gpus.pop()
    pids.pop()
    const busyGpus: string[]= [];
    for (let i = 0; i < pids.length; i++) {
        if(busyGpus.indexOf(pids[i]) <= -1 ){
            busyGpus.push(pids[i]);
        }
        
    }
    for (let i = 0; i < gpus.length; i++) {
        var isBusy='false'
        if(busyGpus.indexOf(gpus[i]) > -1 ){
            isBusy='true';
        }

        const gpu: GPU = {
            name: "cuda "+i,
            isBusy:isBusy,
          };
        gpuList.push(gpu);
    }

    return gpuList
}



export class GpuDependenciesProvider implements vscode.TreeDataProvider<Dependency> {
  constructor(private workspaceRoot: string | undefined) {}
  
  private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined | null | void> = new vscode.EventEmitter<Dependency | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | null | void> = this._onDidChangeTreeData.event;
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  settings(): void {
	this._onDidChangeTreeData.fire();
    // vscode.commands.executeCommand('workbench.action.openSettings', 'remote-gpus-monitor');
  }
  getTreeItem(element: Dependency): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Dependency): Thenable<Dependency[]> {


    if (element) {
		// generate second level dependencies list of machine
		return Promise.resolve(nvidiaQuerytoDep(element.server,element.user,element.key_file));

    } else {
		// generate first level dependencies list of machine
		return Promise.resolve(this.listServers());

    }
  }

  private listServers(): Dependency[] {
	const dependeciesList: Dependency[] = [];
	let config=vscode.workspace.getConfiguration('gpu')
	let out_config=config.get('listServers')
	let serverList: string[]=[]
	if(typeof out_config === 'string'){
		serverList=out_config.split('\n');
	}

	for (let i = 0; i < serverList.length; i++) {
		const newDep=new Dependency(
			serverList[i].substring(serverList[i].indexOf("@") + 1, serverList[i].lastIndexOf(",")),
			serverList[i].split('@')[0],
			serverList[i].split(', ')[1],
			'serv',
			vscode.TreeItemCollapsibleState.Expanded
		);
		dependeciesList.push(newDep)
  	}
	return dependeciesList;
	}
  
}

